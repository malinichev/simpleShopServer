import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductsRepository } from '@/modules/products/products.repository';
import { ProductsService } from '@/modules/products/products.service';
import { SearchService } from '@/modules/search/search.service';
import { SimaLandClient } from './sima-land.client';
import {
  computeTargetStock,
  parseSimaSid,
  FIRST_RUN_LOOKBACK_MS,
} from './stock-sync.utils';
import {
  StockSyncRun,
  StockSyncRunStatus,
  StockSyncTrigger,
} from './entities/stock-sync-run.entity';

/** Ключ pg advisory lock: не даёт пересечься cron-прогону и кнопке в админке. */
const ADVISORY_LOCK_KEY = 8137202601;
/** Параллельных запросов к API поставщика. */
const API_CONCURRENCY = 5;
/** Как часто писать прогресс прогона в БД (для поллинга админки). */
const PROGRESS_FLUSH_EVERY = 25;

interface SyncVariantRow {
  id: string;
  sku: string;
  stock: number;
  productId: string;
}

export interface StockSyncSummary {
  runId?: string;
  totalVariants: number;
  updatedCount: number;
  zeroedCount: number;
  errorCount: number;
  unchangedCount: number;
  dryRun: boolean;
  durationMs: number;
}

export interface StockSyncChange {
  sku: string;
  from: number;
  to: number;
}

/**
 * Синк остатков вариантов каталога SL-* с Сималендом.
 *
 * Прогон: advisory-lock → running-строка → варианты из каталога → продажи
 * с прошлого успешного прогона → остатки API → прямые UPDATE stock →
 * один flush кэша products:* + переиндексация изменённых → итог в строку.
 * CLI (cron) и кнопка админки используют одно ядро — лок в БД защищает
 * от параллельного запуска из разных процессов.
 */
@Injectable()
export class StockSyncService {
  private readonly logger = new Logger(StockSyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly simaClient: SimaLandClient,
    private readonly productsRepository: ProductsRepository,
    private readonly productsService: ProductsService,
    private readonly searchService: SearchService,
  ) {}

  /** Запуск из админки: сразу возвращает running-строку, прогон идёт в фоне. */
  async startBackgroundRun(): Promise<StockSyncRun> {
    if (!this.simaClient.isConfigured()) {
      throw new ConflictException(
        'Синк остатков не настроен: задайте KEY_SIMA_LAND в env сервера',
      );
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const locked = await this.tryAdvisoryLock(runner);
      if (!locked) {
        throw new ConflictException('Синк остатков уже выполняется');
      }
      await this.failStaleRuns();

      const run = await this.createRun(StockSyncTrigger.MANUAL);
      // Прогон в фоне; advisory lock держит connection runner'а до конца.
      void this.executeRun(run, runner).catch((error) => {
        this.logger.error(`Фоновый синк упал: ${(error as Error).message}`);
      });
      return run;
    } catch (error) {
      await runner.release();
      throw error;
    }
  }

  /**
   * Запуск из CLI: блокирующий, возвращает полный отчёт.
   * dryRun ничего не пишет в БД (ни стоков, ни строки прогона).
   */
  async runFromCli(
    dryRun: boolean,
  ): Promise<StockSyncSummary & { changes: StockSyncChange[] }> {
    if (!this.simaClient.isConfigured()) {
      throw new Error('KEY_SIMA_LAND не задан — синк остатков не настроен');
    }
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      locked = await this.tryAdvisoryLock(runner);
      if (!locked) {
        throw new Error('Синк остатков уже выполняется (advisory lock занят)');
      }
      await this.failStaleRuns();
      const run = dryRun ? null : await this.createRun(StockSyncTrigger.CLI);
      // executeRun сам снимает лок и отпускает runner
      return await this.executeRun(run, runner, dryRun);
    } catch (error) {
      if (locked) {
        await runner
          .query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
          .catch(() => undefined);
      }
      await runner.release().catch(() => undefined);
      throw error;
    }
  }

  async findLatestRuns(limit = 10): Promise<StockSyncRun[]> {
    const repo = this.dataSource.getRepository(StockSyncRun);
    return repo.find({ order: { startedAt: 'DESC' }, take: limit });
  }

  async findRun(id: string): Promise<StockSyncRun | null> {
    return this.dataSource.getRepository(StockSyncRun).findOne({
      where: { id },
    });
  }

  /** Минимальный интерфейс connection'а, держащего advisory lock. */
  private async tryAdvisoryLock(runner: QueryCarrier): Promise<boolean> {
    const result = await runner.query<Array<{ locked: boolean }>>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [ADVISORY_LOCK_KEY],
    );
    return result[0]?.locked === true;
  }

  private async unlock(runner: QueryCarrier): Promise<void> {
    await runner
      .query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
      .catch(() => undefined);
  }

  /** Мёртвые running-строки (убитый процесс) закрываем как failed. */
  private async failStaleRuns(): Promise<void> {
    // interval литералом = STALE_RUN_TIMEOUT_MINUTES; параметров нет —
    // служебный jsonb приходит через $1, интерполяции строк нет.
    await this.dataSource.query(
      `UPDATE stock_sync_runs SET status = 'failed',
        "finishedAt" = now(),
        errors = errors || $1::jsonb
      WHERE status = 'running' AND "startedAt" < now() - interval '30 minutes'`,
      [
        JSON.stringify([
          {
            sku: '',
            error: 'прогон завис (убит процесс), закрыт автоматически',
          },
        ]),
      ],
    );
  }

  private async createRun(trigger: StockSyncTrigger): Promise<StockSyncRun> {
    const repo = this.dataSource.getRepository(StockSyncRun);
    return repo.save(
      repo.create({
        status: StockSyncRunStatus.RUNNING,
        trigger,
        startedAt: new Date(),
      }),
    );
  }

  /**
   * Ядро прогона. advisory lock уже взят; снимает его и отпускает runner
   * (и в успехе, и в ошибке) — фоновой запуск передаёт runner, CLI — тоже.
   */
  private async executeRun(
    run: StockSyncRun | null,
    runner: QueryCarrier,
    dryRun = false,
  ): Promise<StockSyncSummary & { changes: StockSyncChange[] }> {
    const startedAt = Date.now();
    const changes: StockSyncChange[] = [];
    const errors: Array<{ sku: string; error: string }> = [];
    let updatedCount = 0;
    let zeroedCount = 0;
    let unchangedCount = 0;

    try {
      const variants = await this.loadSyncVariants();
      const soldSince = await this.loadSoldSince(variants);

      if (run) {
        await this.dataSource
          .getRepository(StockSyncRun)
          .update(run.id, { totalVariants: variants.length });
      }

      let processed = 0;
      let flushedAt = 0;
      const changedSkus = new Set<string>();

      const processVariant = async (variant: SyncVariantRow) => {
        const sid = parseSimaSid(variant.sku);
        if (sid === null) return; // защита: SQL уже фильтрует
        try {
          const result = await this.simaClient.getItemBySid(sid);
          const sold = soldSince.get(variant.id) ?? 0;
          const target = result.found
            ? computeTargetStock(
                {
                  balance: Number(result.item.balance) || 0,
                  minQty: Number(result.item.min_qty) || 1,
                  disabled: Boolean(result.item.is_disabled),
                },
                sold,
              )
            : 0; // 404 — размер снят с продажи

          if (target !== variant.stock) {
            if (!dryRun) {
              await this.productsRepository.updateVariantStock(
                variant.id,
                target,
              );
            }
            changes.push({ sku: variant.sku, from: variant.stock, to: target });
            changedSkus.add(variant.sku);
            updatedCount++;
            if (target === 0) zeroedCount++;
          } else {
            unchangedCount++;
          }
        } catch (error) {
          errors.push({
            sku: variant.sku,
            error: (error as Error).message ?? String(error),
          });
        } finally {
          processed++;
          if (run && processed - flushedAt >= PROGRESS_FLUSH_EVERY) {
            flushedAt = processed;
            try {
              await this.dataSource
                .getRepository(StockSyncRun)
                .update(run.id, { processedVariants: processed });
            } catch {
              /* прогресс не критичен */
            }
          }
        }
      };

      await mapLimit(variants, API_CONCURRENCY, processVariant);

      if (!dryRun && changes.length > 0) {
        // Кэш листингов/карточек — один раз на прогон, не на каждый вариант.
        await this.productsService.invalidateCache();
        // Поисковый индекс (Meili) обновляем только для затронутых товаров.
        const productIds = [
          ...new Set(
            variants
              .filter((v) => changedSkus.has(v.sku))
              .map((v) => v.productId),
          ),
        ];
        for (const productId of productIds) {
          try {
            const product = await this.productsService.findById(productId);
            await this.searchService.onProductSaved(product);
          } catch (error) {
            this.logger.warn(
              `Переиндексация ${productId}: ${(error as Error).message}`,
            );
          }
        }
      }

      const summary: StockSyncSummary & { changes: StockSyncChange[] } = {
        runId: run?.id,
        totalVariants: variants.length,
        updatedCount,
        zeroedCount,
        errorCount: errors.length,
        unchangedCount,
        dryRun,
        durationMs: Date.now() - startedAt,
        changes,
      };

      if (run) {
        await this.dataSource.getRepository(StockSyncRun).update(run.id, {
          status:
            updatedCount + unchangedCount > 0
              ? StockSyncRunStatus.SUCCEEDED
              : StockSyncRunStatus.FAILED,
          finishedAt: new Date(),
          totalVariants: variants.length,
          processedVariants: variants.length,
          updatedCount,
          zeroedCount,
          errorCount: errors.length,
          errors: errors.slice(0, 100),
        });
      }
      await this.unlock(runner);
      await runner.release();
      return summary;
    } catch (error) {
      if (run) {
        await this.dataSource
          .getRepository(StockSyncRun)
          .update(run.id, {
            status: StockSyncRunStatus.FAILED,
            finishedAt: new Date(),
            errorCount: errors.length + 1,
            errors: [
              ...errors.slice(0, 99),
              { sku: '', error: (error as Error).message ?? String(error) },
            ],
          })
          .catch(() => undefined);
      }
      await this.unlock(runner);
      await runner.release().catch(() => undefined);
      throw error;
    }
  }

  /** Варианты каталога Сималенда: SKU = SL-{sid}, без маркируемых и archived. */
  private async loadSyncVariants(): Promise<SyncVariantRow[]> {
    const rows = await this.dataSource.query<SyncVariantRow[]>(`
      SELECT v.id, v.sku, v.stock, v."productId"
      FROM product_variants v
      JOIN products p ON p.id = v."productId"
      WHERE v.sku ~ '^SL-[0-9]+$'
        AND p.status <> 'archived'
        AND (p."requiresMarking" IS NOT TRUE)
      ORDER BY v.sku
    `);
    // Фильтр подмножества (диагностика одного товара / e2e-прогон):
    // STOCK_SYNC_SIDS="123,456" — прогнать только эти sid.
    const sidsFilter = (process.env.STOCK_SYNC_SIDS ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (sidsFilter.length === 0) {
      return rows;
    }
    const allow = new Set(sidsFilter);
    return rows.filter((r) => allow.has(parseSimaSid(r.sku) ?? -1));
  }

  /** Продажи вариантов с якоря: заказ не cancelled/refunded списывает сток. */
  private async loadSoldSince(
    variants: SyncVariantRow[],
  ): Promise<Map<string, number>> {
    const anchor = await this.lastSuccessAnchor();
    const ids = variants.map((v) => v.id);
    if (ids.length === 0) return new Map();

    const rows = await this.dataSource.query<
      Array<{ id: string; sold: number }>
    >(
      `SELECT oi."variantId" AS id, SUM(oi.quantity)::int AS sold
       FROM order_items oi
       JOIN orders o ON o.id = oi."orderId"
       WHERE o.status NOT IN ('cancelled', 'refunded')
         AND o."createdAt" > $1
         AND oi."variantId" = ANY($2::text[])
       GROUP BY oi."variantId"`,
      [anchor, ids],
    );
    return new Map(rows.map((r) => [r.id, Number(r.sold)]));
  }

  /** startedAt последнего успешного прогона; иначе now − 24ч (первый прогон). */
  private async lastSuccessAnchor(): Promise<Date> {
    const rows = await this.dataSource.query<
      Array<{ startedAt: Date | string }>
    >(
      `SELECT "startedAt" FROM stock_sync_runs
       WHERE status = 'succeeded' ORDER BY "startedAt" DESC LIMIT 1`,
    );
    if (rows.length > 0) {
      return new Date(rows[0].startedAt);
    }
    return new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
  }
}

/** Connection, держащий advisory lock (queryRunner CLI/фонового прогона). */
interface QueryCarrier {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
  release(): Promise<void>;
}

/** Простейший ограниченный параллелизм (без внешних зависимостей). */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await fn(item);
      }
    })(),
  );
  await Promise.all(workers);
}
