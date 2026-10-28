import { promises as fsp } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import {
  QueryFn,
  backupCounts,
  createDbBackup,
  parseBackupBuffer,
  restoreDbBackup,
  serializeBackup,
  withBackupTransaction,
} from '../modules/backup/core/db-dump';

/**
 * CLI бэкапа/восстановления БД — тот же core, что и в админке
 * (server/src/modules/backup). Запускается скриптами deploy/backup-db.sh
 * и deploy/restore-db.sh (локально и на production через SSH).
 *
 * Использование (из каталога server/):
 *   node dist/scripts/backup-cli.js backup [--out <директория>]
 *   node dist/scripts/backup-cli.js restore <файл .json.gz | .json> [--no-orders]
 *
 * restore по умолчанию полный (включая заказы) — это путь аварийного
 * восстановления. --no-orders: заказы и ссылающиеся на них таблицы не
 * трогаются, текущие заказы сохраняются.
 *
 * Печатает маркер BACKUP_FILE:<абсолютный путь> — его парсят sh-обёртки.
 */

for (const envFile of ['.env.development', '.env.production', '.env']) {
  const path = resolve(process.cwd(), envFile);
  if (existsSync(path)) {
    dotenvConfig({ path });
    break;
  }
}

const isProd = process.env.NODE_ENV === 'production';

function buildClientConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'sports-shop',
    // SSL только для удалённых БД — тот же правило, что в data-source.ts
    ssl:
      isProd &&
      !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '')
        ? { rejectUnauthorized: false }
        : false,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

function timestampName(): string {
  const now = new Date();
  return (
    `backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command !== 'backup' && command !== 'restore') {
    console.error(
      'Использование:\n' +
        '  node dist/scripts/backup-cli.js backup [--out <директория>]\n' +
        '  node dist/scripts/backup-cli.js restore <файл> [--no-orders]',
    );
    process.exit(1);
  }

  const client = new Client(buildClientConfig());
  await client.connect();
  const query: QueryFn = async (sql, params) =>
    (await client.query(sql, params)).rows;

  try {
    if (command === 'backup') {
      const outIndex = args.indexOf('--out');
      const outDir = resolve(
        process.cwd(),
        outIndex !== -1 && args[outIndex + 1]
          ? args[outIndex + 1]
          : process.env.BACKUP_DIR || 'backups',
      );

      console.log('⏳ Создаю бэкап БД...');
      const backup = await withBackupTransaction(query, 'backup', () =>
        createDbBackup(query),
      );
      const buffer = await serializeBackup(backup);
      await fsp.mkdir(outDir, { recursive: true });
      const filePath = resolve(outDir, `${timestampName()}.json.gz`);
      await fsp.writeFile(filePath, buffer);

      const counts = backupCounts(backup);
      console.log(`✅ Бэкап создан: ${filePath}`);
      console.log(
        `   БД: ${backup.database} (${backup.pgVersion}), ` +
          `таблиц: ${counts.tableCount}, строк: ${counts.rowCount}, ` +
          `размер: ${(buffer.length / 1024).toFixed(1)} КБ`,
      );
      // Маркер для sh-обёрток (scp файла и т.п.)
      console.log(`BACKUP_FILE:${filePath}`);
    } else {
      const noOrders = args.includes('--no-orders');
      const fileArg = args.find((a) => !a.startsWith('--'));
      const filePath = resolve(process.cwd(), fileArg ?? '');
      if (!fileArg || !existsSync(filePath)) {
        console.error(`❌ Файл не найден: ${fileArg ?? '(не указан)'}`);
        process.exit(1);
      }

      console.log(`⏳ Восстанавливаю БД из ${filePath}${noOrders ? ' (без заказов)' : ''}...`);
      const backup = await parseBackupBuffer(await fsp.readFile(filePath));
      const result = await withBackupTransaction(query, 'restore', () =>
        restoreDbBackup(query, backup, {
          includeOrders: !noOrders,
        }),
      );
      console.log(
        `✅ Восстановлено: таблиц ${result.restoredTables.length}, ` +
          `строк ${result.restoredRows}`,
      );
      if (result.skippedTables.length > 0) {
        console.log(
          `   Пропущены (нет в текущей схеме): ${result.skippedTables.join(', ')}`,
        );
      }
      if (result.excludedTables.length > 0) {
        console.log(
          `   Не тронуты (заказы и ссылающиеся): ${result.excludedTables.join(', ')}; ` +
            `текущих заказов сохранено: ${result.currentOrdersKept}`,
        );
      }
      console.log(
        `   Главных администраторов сохранено текущими: ${result.keptSuperAdmins}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`❌ Ошибка: ${(error as Error).message}`);
  process.exit(1);
});
