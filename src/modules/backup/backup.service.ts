import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, promises as fsp } from 'fs';
import { join, resolve } from 'path';
import {
  DbBackup,
  QueryFn,
  backupCounts,
  createDbBackup,
  parseBackupBuffer,
  restoreDbBackup,
  serializeBackup,
  withBackupTransaction,
} from './core/db-dump';
import { BackupItemDto, RestoreBackupResponseDto } from './dto/backup.dto';

/**
 * Безопасное имя файла бэкапа: буквы/цифры (вкл. кириллицу), `_ . - ( )`,
 * пробел; расширение всегда .json.gz (храним нормализованно в gzip).
 * Без `/` и `\` — path traversal невозможен.
 */
const BACKUP_FILE_RE = /^[\p{L}\p{N}_.\-() ]{1,120}\.json\.gz$/u;

/**
 * multipart (busboy/multer) отдаёт filename как latin1-декодированные UTF-8
 * байты: «мой» приходит как «Ð¼Ð¾Ð¹». Если в строке есть символы только из
 * диапазона U+0080–U+00FF — это почти наверняка такой случай: перекодируем.
 * Корректно декодированная кириллица (символы > U+00FF) не трогается.
 */
function fixMultipartFilename(name: string): string {
  const chars = [...name];
  const looksLikeMojibake = chars.some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c >= 0x80 && c <= 0xff;
  });
  if (!looksLikeMojibake) {
    return name;
  }
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('\uFFFD') ? name : utf8;
}

/**
 * Чистит имя, присланное пользователем: срезает путь, заменяет опасные
 * символы на `_`, нормализует расширение в .json.gz. Возвращает null, если
 * после чистки ничего осмысленного не осталось.
 */
function sanitizeUploadName(originalName: string): string | null {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[^\p{L}\p{N}_.\-() ]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  // Храним всегда в gzip — приводим расширение к .json.gz
  const core = cleaned.replace(/(\.json)?(\.gz)?$/i, '');
  if (!core) {
    return null;
  }
  const name = `${core.slice(0, 120)}.json.gz`;
  return BACKUP_FILE_RE.test(name) ? name : null;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retention: number;

  /** Одна тяжёлая операция за раз в рамках процесса (межпроцессно — advisory lock в PG) */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.backupDir = resolve(
      process.cwd(),
      configService.get<string>('backup.dir') || 'backups',
    );
    this.retention = configService.get<number>('backup.retention') ?? 20;
    this.logger.log(`Директория бэкапов: ${this.backupDir} (хранить: ${this.retention})`);
  }

  // ==================== Публичные операции ====================

  async list(): Promise<BackupItemDto[]> {
    await this.ensureDir();
    const files = (await fsp.readdir(this.backupDir)).filter((f) =>
      BACKUP_FILE_RE.test(f),
    );
    const items = await Promise.all(files.map((f) => this.readMeta(f)));
    // Произвольные пользовательские имена — сортируем по дате, не по алфавиту
    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async create(): Promise<BackupItemDto> {
    return this.serialize(() =>
      (async () => {
        await this.ensureDir();

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        const query: QueryFn = (sql, params) => qr.query(sql, params);

        let backup: DbBackup;
        try {
          backup = await withBackupTransaction(query, 'backup', () =>
            createDbBackup(query),
          );
        } finally {
          await qr.release();
        }

        const buffer = await serializeBackup(backup);
        const filename = await this.uniqueName(this.timestampCore());
        await fsp.writeFile(join(this.backupDir, filename), buffer);
        await this.writeMeta(filename, backup);
        await this.prune();

        this.logger.log(`Создан бэкап ${filename}`);
        return this.readMeta(filename);
      })(),
    );
  }

  async restore(
    id: string,
    options: { includeOrders?: boolean } = {},
  ): Promise<RestoreBackupResponseDto> {
    return this.serialize(() =>
      (async () => {
        const file = await this.resolveExisting(id);
        const backup = await this.parseBackup(
          await fsp.readFile(join(this.backupDir, file)),
        );

        const started = Date.now();
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        const query: QueryFn = (sql, params) => qr.query(sql, params);

        let result;
        try {
          result = await withBackupTransaction(query, 'restore', () =>
            restoreDbBackup(query, backup, options),
          );
        } finally {
          await qr.release();
        }

        this.logger.log(
          `Восстановлен бэкап ${file}: таблиц ${result.restoredTables.length}, ` +
            `строк ${result.restoredRows}, главных админов сохранено ${result.keptSuperAdmins}` +
            (result.excludedTables.length > 0
              ? `, заказы оставлены текущими (${result.currentOrdersKept})`
              : ''),
        );
        return { ...result, durationMs: Date.now() - started };
      })(),
    );
  }

  /** Файл для стриминга контроллером. id валидируется по листингу директории. */
  async getDownload(id: string): Promise<{
    filePath: string;
    filename: string;
    sizeBytes: number;
  }> {
    const filename = await this.resolveExisting(id);
    const stat = await fsp.stat(join(this.backupDir, filename));
    return {
      filePath: join(this.backupDir, filename),
      filename,
      sizeBytes: stat.size,
    };
  }

  /**
   * Загруженный пользователем файл сохраняется под его именем (очищенным от
   * опасных символов, с расширением .json.gz и суффиксом при коллизии).
   */
  async saveUploaded(
    buffer: Buffer,
    originalName?: string,
  ): Promise<BackupItemDto> {
    const backup = await this.parseBackup(buffer);

    await this.ensureDir();
    const core =
      sanitizeUploadName(fixMultipartFilename(originalName ?? ''))?.replace(
        /\.json\.gz$/,
        '',
      ) ?? this.timestampCore();
    const filename = await this.uniqueName(core);
    // Нормализуем хранение: всегда .json.gz, даже если загрузили распакованный JSON
    await fsp.writeFile(
      join(this.backupDir, filename),
      await serializeBackup(backup),
    );
    await this.writeMeta(filename, backup);

    this.logger.log(`Загружен файл бэкапа → ${filename}`);
    return this.readMeta(filename);
  }

  async remove(id: string): Promise<void> {
    const filename = await this.resolveExisting(id);
    await fsp.unlink(join(this.backupDir, filename));
    await fsp.unlink(this.metaPath(filename)).catch(() => undefined);
    this.logger.log(`Удалён бэкап ${filename}`);
  }

  // ==================== Внутреннее ====================

  private async serialize<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async ensureDir(): Promise<void> {
    await fsp.mkdir(this.backupDir, { recursive: true });
  }

  private metaPath(filename: string): string {
    return join(this.backupDir, `${filename}.meta.json`);
  }

  /** id всегда резолвится по реальному листингу директории — path traversal невозможен */
  private async resolveExisting(id: string): Promise<string> {
    if (!BACKUP_FILE_RE.test(id)) {
      throw new NotFoundException(`Бэкап ${id} не найден`);
    }
    if (!existsSync(join(this.backupDir, id))) {
      throw new NotFoundException(`Бэкап ${id} не найден`);
    }
    return id;
  }

  /** Основа сгенерированного имени: backup-YYYYMMDD-HHmmss */
  private timestampCore(): string {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
      `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
    );
  }

  /** Свободное имя: при коллизии добавляет -2, -3, … */
  private async uniqueName(core: string): Promise<string> {
    let candidate = `${core}.json.gz`;
    let n = 1;
    while (existsSync(join(this.backupDir, candidate))) {
      candidate = `${core}-${++n}.json.gz`;
    }
    return candidate;
  }

  private async writeMeta(filename: string, backup: DbBackup): Promise<void> {
    const counts = backupCounts(backup);
    await fsp.writeFile(
      this.metaPath(filename),
      JSON.stringify({ createdAt: backup.createdAt, ...counts }),
    );
  }

  private async readMeta(filename: string): Promise<BackupItemDto> {
    const stat = await fsp.stat(join(this.backupDir, filename));
    let counts = { tableCount: 0, rowCount: 0 };
    let createdAt = stat.mtime.toISOString();
    try {
      const meta = JSON.parse(
        await fsp.readFile(this.metaPath(filename), 'utf8'),
      );
      counts = {
        tableCount: meta.tableCount ?? 0,
        rowCount: meta.rowCount ?? 0,
      };
      if (meta.createdAt) createdAt = meta.createdAt;
    } catch {
      // sidecar отсутствует/битый — показываем данные файловой системы
    }
    return {
      id: filename,
      createdAt,
      sizeBytes: stat.size,
      ...counts,
    };
  }

  /** Ротация: оставляем последние `retention` файлов (старые — по mtime) */
  private async prune(): Promise<void> {
    const files = (
      await fsp.readdir(this.backupDir)
    ).filter((f) => BACKUP_FILE_RE.test(f));
    const withTimes = await Promise.all(
      files.map(async (f) => ({
        file: f,
        mtime: (await fsp.stat(join(this.backupDir, f))).mtimeMs,
      })),
    );
    withTimes.sort((a, b) => a.mtime - b.mtime);
    for (const { file } of withTimes.slice(
      0,
      Math.max(0, withTimes.length - this.retention),
    )) {
      await fsp.unlink(join(this.backupDir, file)).catch(() => undefined);
      await fsp.unlink(this.metaPath(file)).catch(() => undefined);
      this.logger.log(`Ротация: удалён старый бэкап ${file}`);
    }
  }

  private async parseBackup(buffer: Buffer): Promise<DbBackup> {
    try {
      return await parseBackupBuffer(buffer);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /** Читалка потока для контроллера (вынесено для тестируемости) */
  stream(filePath: string) {
    return createReadStream(filePath);
  }
}
