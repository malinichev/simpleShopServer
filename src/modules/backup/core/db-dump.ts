import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Ядро бэкапа/восстановления БД без зависимостей от Nest — используется
 * и API-модулем (через TypeORM QueryRunner), и CLI-скриптом (через pg Client).
 *
 * Подход: data-only дамп (строки всех таблиц public + состояние секвенций)
 * в gzip-JSON. Схему не дампим — она управляется entities + миграциями в git.
 *
 * Особенности:
 * - Восстановление идёт в одной транзакции: любая ошибка = rollback.
 * - FK отключаются через ALTER TABLE ... DISABLE TRIGGER ALL (владелец таблиц
 *   имеет на это право и на managed PostgreSQL без суперюзера; это же делает
 *   pg_restore --disable-triggers).
 * - Текущие главные администраторы (role='super_admin') переносятся через
 *   восстановление как есть: их email/пароль/сессия никогда не затираются
 *   данными из бэкапа (админ управляется вручную скриптом create-admin.sh).
 * - pg_advisory_xact_lock сериализует бэкап/рестор, в т.ч. между процессами.
 */

/** Адаптер, скрывающий разницу TypeORM QueryRunner и pg Client. */
export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;

export const BACKUP_FORMAT = 'svoybrand-db-backup';
export const BACKUP_VERSION = 1;

/** Ключ advisory-блокировки (произвольный, общий для API и CLI). */
const ADVISORY_LOCK_KEY = 857312301;

/** Служебные таблицы, не относящиеся к данным приложения. */
const EXCLUDED_TABLES = new Set(['typeorm_migrations']);

/** Роли, строки которых переживают восстановление без изменений. */
const PRESERVED_ROLE = 'super_admin';
const PRESERVED_USER_COLUMNS = ['email', 'password', 'refreshTokens', 'role'];

const INSERT_BATCH_ROWS = 100;

export interface BackupTable {
  columns: string[];
  /** data_type из information_schema — нужен для подготовки значений при INSERT */
  columnTypes: Record<string, string>;
  rows: unknown[][];
}

export interface DbBackup {
  format: string;
  version: number;
  createdAt: string;
  pgVersion: string;
  database: string;
  tables: Record<string, BackupTable>;
  /** last_value по секвенциям; null — секвенция ни разу не использовалась */
  sequences: Record<string, number | null>;
}

export interface RestoreResult {
  restoredTables: string[];
  skippedTables: string[];
  /** Таблицы, не тронутые по опции includeOrders=false (заказы + ссылающиеся) */
  excludedTables: string[];
  restoredRows: number;
  keptSuperAdmins: number;
  /** Текущие заказы, оставленные нетронутыми при includeOrders=false */
  currentOrdersKept: number;
}

export interface RestoreOptions {
  /**
   * false — заказы (и всё, что ссылается на них по FK: order_items, reviews,
   * …) не восстанавливаются и не очищаются: текущие заказы сохраняются,
   * остальная база возвращается к состоянию бэкапа.
   * По умолчанию (undefined/true) — полное восстановление.
   */
  includeOrders?: boolean;
}

/** Таблицы-«семена» заказа для вычисления исключаемого замыкания по FK */
const ORDER_SEED_TABLES = ['orders'];

/**
 * Замыкание по FK: семена + все таблицы public, которые (транзитивно)
 * ссылаются на них внешними ключами.
 */
async function fkClosureFrom(
  query: QueryFn,
  seeds: string[],
): Promise<Set<string>> {
  const rows = await query(`
    SELECT cl_rel.relname AS referencing, cl_ref.relname AS referenced
    FROM pg_constraint c
    JOIN pg_class cl_rel ON cl_rel.oid = c.conrelid
    JOIN pg_class cl_ref ON cl_ref.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = cl_rel.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
  `);
  const referencing = new Map<string, string[]>();
  for (const row of rows) {
    const ref = String(row.referenced);
    referencing.set(ref, [...(referencing.get(ref) ?? []), String(row.referencing)]);
  }

  const closure = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const table = queue.shift()!;
    if (closure.has(table)) continue;
    closure.add(table);
    queue.push(...(referencing.get(table) ?? []));
  }
  return closure;
}

function qid(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function listTables(query: QueryFn): Promise<string[]> {
  const rows = await query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relispartition = false
    ORDER BY c.relname
  `);
  return rows
    .map((r) => String(r.table_name))
    .filter((t) => !EXCLUDED_TABLES.has(t));
}

async function listColumns(
  query: QueryFn,
  table: string,
): Promise<{ columns: string[]; columnTypes: Record<string, string> }> {
  const rows = await query(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [table],
  );
  const columns: string[] = [];
  const columnTypes: Record<string, string> = {};
  for (const row of rows) {
    const name = String(row.column_name);
    columns.push(name);
    columnTypes[name] = String(row.data_type);
  }
  return { columns, columnTypes };
}

async function listSequences(
  query: QueryFn,
): Promise<Record<string, number | null>> {
  const rows = await query(
    `SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public'`,
  );
  const sequences: Record<string, number | null> = {};
  for (const row of rows) {
    sequences[String(row.sequencename)] =
      row.last_value === null ? null : Number(row.last_value);
  }
  return sequences;
}

/**
 * Транзакция для бэкапа/рестора: BEGIN + (для бэкапа — REPEATABLE READ READ
 * ONLY, согласованное чтение всех таблиц) + advisory-блокировка от гонок
 * с другим бэкапом/рестором (в т.ч. из другого процесса — CLI).
 */
export async function withBackupTransaction<T>(
  query: QueryFn,
  mode: 'backup' | 'restore',
  fn: () => Promise<T>,
): Promise<T> {
  await query('BEGIN');
  try {
    if (mode === 'backup') {
      await query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
    }
    await query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);
    const result = await fn();
    await query('COMMIT');
    return result;
  } catch (error) {
    try {
      await query('ROLLBACK');
    } catch {
      // соединение могло оборваться — оригинальная причина важнее
    }
    throw error;
  }
}

export async function createDbBackup(query: QueryFn): Promise<DbBackup> {
  const tables = await listTables(query);
  const backup: DbBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    pgVersion: '',
    database: '',
    tables: {},
    sequences: {},
  };

  const info = await query('SELECT version() AS v, current_database() AS db');
  backup.pgVersion = String(info[0]?.v ?? '').split(' ').slice(0, 2).join(' ');
  backup.database = String(info[0]?.db ?? '');

  for (const table of tables) {
    const { columns, columnTypes } = await listColumns(query, table);
    const rawRows = await query(`SELECT * FROM ${qid(table)}`);
    backup.tables[table] = {
      columns,
      columnTypes,
      rows: rawRows.map((row) => columns.map((c) => row[c] ?? null)),
    };
  }

  backup.sequences = await listSequences(query);
  return backup;
}

/** Приводит значение из дампа к виду, пригодному для параметризованного INSERT. */
function prepareValue(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined) return null;
  if (
    (dataType === 'json' || dataType === 'jsonb') &&
    typeof value !== 'string'
  ) {
    return JSON.stringify(value);
  }
  if (
    dataType === 'bytea' &&
    typeof value === 'object' &&
    (value as { type?: string }).type === 'Buffer'
  ) {
    return Buffer.from((value as { data: number[] }).data);
  }
  return value;
}

function backupCounts(backup: DbBackup): {
  tableCount: number;
  rowCount: number;
} {
  let rowCount = 0;
  for (const t of Object.values(backup.tables)) rowCount += t.rows.length;
  return { tableCount: Object.keys(backup.tables).length, rowCount };
}

export async function restoreDbBackup(
  query: QueryFn,
  backup: DbBackup,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const dbTables = await listTables(query);
  const dbTableSet = new Set(dbTables);

  // Режим «без заказов»: заказы и ссылающиеся на них таблицы не трогаем —
  // текущие заказы переживают восстановление
  const excluded =
    options.includeOrders === false
      ? await fkClosureFrom(query, ORDER_SEED_TABLES)
      : new Set<string>();

  const skippedTables = Object.keys(backup.tables).filter(
    (t) => !dbTableSet.has(t),
  );
  const restoreTables = Object.keys(backup.tables).filter(
    (t) => dbTableSet.has(t) && !excluded.has(t),
  );

  let currentOrdersKept = 0;
  if (options.includeOrders === false && dbTableSet.has('orders')) {
    const counted = await query('SELECT count(*)::int AS n FROM "orders"');
    currentOrdersKept = Number(counted[0]?.n ?? 0);
  }

  // Дамп должен ложиться на ту же схему: все колонки дампа должны существовать
  const dbColumnTypes: Record<string, Record<string, string>> = {};
  for (const table of restoreTables) {
    const { columns, columnTypes } = await listColumns(query, table);
    dbColumnTypes[table] = columnTypes;
    const current = new Set(columns);
    const missing = backup.tables[table].columns.filter(
      (c) => !current.has(c),
    );
    if (missing.length > 0) {
      throw new Error(
        `Схема таблицы "${table}" изменилась (нет колонок: ${missing.join(', ')}). ` +
          'Восстановление возможно только той же версией приложения.',
      );
    }
  }

  // Текущие главные администраторы — переживут восстановление без изменений
  const usersTable = 'users';
  let superAdmins: Record<string, unknown>[] = [];
  if (restoreTables.includes(usersTable)) {
    superAdmins = await query(
      `SELECT * FROM ${qid(usersTable)} WHERE "role" = $1`,
      [PRESERVED_ROLE],
    );
  }

  // FK и триггеры отключаем на время загрузки (порядок строк не важен)
  for (const table of restoreTables) {
    await query(`ALTER TABLE ${qid(table)} DISABLE TRIGGER ALL`);
  }

  try {
    if (restoreTables.length > 0) {
      // DELETE вместо TRUNCATE ... CASCADE: CASCADE неявно затирает и
      // ссылающиеся таблицы (например, заказы при includeOrders=false —
      // они ссылаются на users). DELETE действует строго по списку;
      // FK-триггеры на восстанавливаемых таблицах уже отключены.
      for (const table of restoreTables) {
        await query(`DELETE FROM ${qid(table)}`);
      }
    }

    let restoredRows = 0;
    for (const table of restoreTables) {
      const { columns, columnTypes, rows } = backup.tables[table];
      if (rows.length === 0) continue;

      const columnList = columns.map(qid).join(', ');
      for (let i = 0; i < rows.length; i += INSERT_BATCH_ROWS) {
        const chunk = rows.slice(i, i + INSERT_BATCH_ROWS);
        const params: unknown[] = [];
        const values: string[] = [];
        let p = 1;
        for (const row of chunk) {
          values.push(
            `(${columns.map(() => `$${p++}`).join(', ')})`,
          );
          columns.forEach((col, idx) => {
            params.push(prepareValue(row[idx], columnTypes[col]));
          });
        }
        await query(
          `INSERT INTO ${qid(table)} (${columnList}) VALUES ${values.join(', ')}`,
          params,
        );
      }
      restoredRows += rows.length;
    }

    // Секвенции — в состояние из дампа (имя параметром: идентификатор в кавычках
    // PG трактует как колонку)
    const dbSequences = await listSequences(query);
    for (const [seq, lastValue] of Object.entries(backup.sequences)) {
      if (!(seq in dbSequences)) continue;
      if (lastValue === null) {
        await query(`SELECT setval($1::regclass, 1, false)`, [
          `public.${seq}`,
        ]);
      } else {
        await query(`SELECT setval($1::regclass, $2, true)`, [
          `public.${seq}`,
          lastValue,
        ]);
      }
    }

    // Главные администраторы возвращаются как были (email/пароль/сессия/роль).
    // Значения готовим тем же типизированным prepareValue, что и строки дампа:
    // jsonb-массивы (addresses) нужно JSON-стрингифицировать, а pg-массивы
    // (wishlist uuid[]) — отдавать как есть; без типа колонки их не различить.
    if (restoreTables.includes(usersTable) && superAdmins.length > 0) {
      const usersColumnTypes = dbColumnTypes[usersTable] ?? {};
      const adminColumns = Object.keys(superAdmins[0]);
      const updateColumns = PRESERVED_USER_COLUMNS.filter((c) =>
        adminColumns.includes(c),
      );
      for (const admin of superAdmins) {
        const placeholders = adminColumns
          .map((_, i) => `$${i + 1}`)
          .join(', ');
        const params = adminColumns.map((c) =>
          prepareValue(admin[c], usersColumnTypes[c]),
        );
        await query(
          `INSERT INTO ${qid(usersTable)} (${adminColumns.map(qid).join(', ')}) ` +
            `VALUES (${placeholders}) ` +
            `ON CONFLICT ("id") DO UPDATE SET ` +
            updateColumns
              .map((c) => `${qid(c)} = EXCLUDED.${qid(c)}`)
              .join(', '),
          params,
        );
      }
    }

    return {
      restoredTables: restoreTables,
      skippedTables,
      excludedTables: [...excluded].filter((t) =>
        Object.keys(backup.tables).includes(t),
      ),
      restoredRows,
      keptSuperAdmins: superAdmins.length,
      currentOrdersKept,
    };
  } finally {
    // Триггеры включаем обратно даже при ошибке (роллбэк и так вернул бы их)
    for (const table of restoreTables) {
      await query(`ALTER TABLE ${qid(table)} ENABLE TRIGGER ALL`).catch(() =>
        undefined,
      );
    }
  }
}

// ==================== Сериализация ====================

export async function serializeBackup(backup: DbBackup): Promise<Buffer> {
  const json = JSON.stringify(backup);
  return gzipAsync(json);
}

export function assertValidBackup(data: unknown): asserts data is DbBackup {
  const error = (reason: string): Error =>
    new Error(`Файл не является корректным бэкапом БД: ${reason}`);

  if (typeof data !== 'object' || data === null) throw error('ожидается JSON-объект');
  const candidate = data as Partial<DbBackup>;
  if (candidate.format !== BACKUP_FORMAT) {
    throw error(`неверный format (ожидался "${BACKUP_FORMAT}")`);
  }
  if (candidate.version !== BACKUP_VERSION) {
    throw error(`неподдерживаемая версия ${String(candidate.version)}`);
  }
  if (
    typeof candidate.tables !== 'object' ||
    candidate.tables === null ||
    Object.keys(candidate.tables).length === 0
  ) {
    throw error('нет таблиц');
  }
  for (const [table, t] of Object.entries(candidate.tables)) {
    if (
      !t ||
      !Array.isArray((t as BackupTable).columns) ||
      !Array.isArray((t as BackupTable).rows) ||
      !(t as BackupTable).columnTypes
    ) {
      throw error(`таблица "${table}" повреждена`);
    }
  }
}

export async function parseBackupBuffer(
  buffer: Buffer,
): Promise<DbBackup> {
  const isGzip =
    buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const json = isGzip ? await gunzipAsync(buffer) : buffer;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.toString('utf8'));
  } catch {
    throw new Error('Файл не является корректным бэкапом БД: битый JSON');
  }
  assertValidBackup(parsed);
  return parsed;
}

export { backupCounts };
