import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SimaLandClient, SimaItemComment } from '@/modules/stock-sync/sima-land.client';
import { parseSimaSid } from '@/modules/stock-sync/stock-sync.utils';
import { UploadService } from '@/modules/upload/upload.service';
import { ProductsRepository } from '@/modules/products/products.repository';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import { ExternalReviewsRepository } from '@/modules/reviews/external-reviews.repository';
import {
  ExternalReview,
  EXTERNAL_REVIEW_SOURCE,
} from '@/modules/reviews/entities/external-review.entity';
import {
  ReviewsSyncRun,
  ReviewsSyncRunStatus,
  ReviewsSyncTrigger,
  ReviewsSyncError,
} from './entities/reviews-sync-run.entity';

/** Ключ pg advisory lock (другой, чем у stock-sync 8137202601). */
const ADVISORY_LOCK_KEY = 8137202602;
/**
 * Плавность запросов к API — как у stock-sync: WAF Сималенда банит по
 * частоте. Последовательный режим 1 запрос / 1.2 c; 188 моделей ≈ 2 запроса
 * на модель (item + первая страница отзывов) ≈ 8 минут.
 */
const API_CONCURRENCY = 1;
const MIN_REQUEST_INTERVAL_MS = 1_200;
/** Как часто писать прогресс прогона в БД (для поллинга админки). */
const PROGRESS_FLUSH_EVERY = 10;
/** item_comment_status_id опубликованных отзывов (проба API 2026-11-05). */
const PUBLISHED_STATUS_ID = 3;
/** Максимум страниц отзывов на товар — страховка от вечного цикла. */
const MAX_COMMENT_PAGES = 20;
/** Максимум фото отзыва, зеркалимых в наш S3. */
const MAX_PHOTOS_PER_REVIEW = 5;

interface SyncProductRow {
  productId: string;
  sid: number;
}

export interface ReviewsSyncSummary {
  runId?: string;
  totalProducts: number;
  productsWithComments: number;
  importedCount: number;
  updatedCount: number;
  removedCount: number;
  errorCount: number;
  dryRun: boolean;
  durationMs: number;
}

/**
 * Синк отзывов поставщика (Сима-ленд, item-comment API v3) с кнопкой в
 * админке. Cron НЕ используется — только ручные прогоны: расход запросов к
 * API поставщика под контролем юзера (решение 2026-11-05).
 *
 * Прогон: advisory-lock → running-строка → товары (модели SL-*) → по одному
 * sid на модель (фильтр item_id у Сималенда групповой — отзывы всей модели)
 * → item/?sid= (item_id + comments_count; 0 → подчистить) → item-comment
 * всеми страницами → upsert по (source, externalId) + зеркало фото в S3 →
 * удаление пропавших → пересчёт агрегатов и комбинированного рейтинга →
 * flush кэшей reviews/products.
 */
@Injectable()
export class ReviewsSyncService {
  private readonly logger = new Logger(ReviewsSyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepository: Repository<ProductVariantEntity>,
    private readonly simaClient: SimaLandClient,
    private readonly uploadService: UploadService,
    private readonly productsRepository: ProductsRepository,
    private readonly reviewsService: ReviewsService,
    private readonly externalReviewsRepository: ExternalReviewsRepository,
  ) {}

  /** Запуск из админки: сразу возвращает running-строку, прогон идёт в фоне. */
  async startBackgroundRun(): Promise<ReviewsSyncRun> {
    if (!this.simaClient.isConfigured()) {
      throw new ConflictException(
        'Синк отзывов не настроен: задайте KEY_SIMA_LAND в env сервера',
      );
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const locked = await this.tryAdvisoryLock(runner);
      if (!locked) {
        throw new ConflictException('Синк отзывов уже выполняется');
      }
      await this.failStaleRuns();

      const run = await this.createRun(ReviewsSyncTrigger.MANUAL);
      // Прогон в фоне; advisory lock держит connection runner'а до конца.
      void this.executeRun(run, runner, false).catch((error) => {
        this.logger.error(`Фоновый синк отзывов упал: ${(error as Error).message}`);
      });
      return run;
    } catch (error) {
      await runner.release();
      throw error;
    }
  }

  /** Запуск из CLI: блокирующий, dryRun ничего не пишет в БД. */
  async runFromCli(dryRun: boolean): Promise<ReviewsSyncSummary> {
    if (!this.simaClient.isConfigured()) {
      throw new Error('KEY_SIMA_LAND не задан — синк отзывов не настроен');
    }
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      locked = await this.tryAdvisoryLock(runner);
      if (!locked) {
        throw new Error('Синк отзывов уже выполняется (advisory lock занят)');
      }
      await this.failStaleRuns();
      const run = dryRun ? null : await this.createRun(ReviewsSyncTrigger.CLI);
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

  async findLatestRuns(limit = 10): Promise<ReviewsSyncRun[]> {
    return this.dataSource.getRepository(ReviewsSyncRun).find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async findRun(id: string): Promise<ReviewsSyncRun | null> {
    return this.dataSource.getRepository(ReviewsSyncRun).findOne({
      where: { id },
    });
  }

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
    await this.dataSource.query(
      `UPDATE reviews_sync_runs SET status = 'failed',
        "finishedAt" = now(),
        errors = errors || $1::jsonb
      WHERE status = 'running' AND "startedAt" < now() - interval '30 minutes'`,
      [
        JSON.stringify([
          {
            product: '',
            error: 'прогон завис (убит процесс), закрыт автоматически',
          },
        ]),
      ],
    );
  }

  private async createRun(trigger: ReviewsSyncTrigger): Promise<ReviewsSyncRun> {
    const repo = this.dataSource.getRepository(ReviewsSyncRun);
    return repo.save(
      repo.create({
        status: ReviewsSyncRunStatus.RUNNING,
        trigger,
        startedAt: new Date(),
        errors: [],
      }),
    );
  }

  /** Ядро прогона: лок уже взят, снимает его и отпускает runner в конце. */
  private async executeRun(
    run: ReviewsSyncRun | null,
    runner: QueryCarrier,
    dryRun: boolean,
  ): Promise<ReviewsSyncSummary> {
    const startedAt = Date.now();
    const errors: ReviewsSyncError[] = [];
    let importedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;
    let productsWithComments = 0;

    try {
      const products = await this.loadSyncProducts();
      const touchedProductIds = new Set<string>();

      if (run) {
        await this.dataSource
          .getRepository(ReviewsSyncRun)
          .update(run.id, { totalProducts: products.length });
      }

      let processed = 0;
      let flushedAt = 0;
      let nextRequestAt = 0;
      const throttle = async () => {
        const wait = nextRequestAt - Date.now();
        if (wait > 0) await sleep(wait);
        nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
      };

      const processProduct = async (row: SyncProductRow) => {
        try {
          await throttle();
          const itemResult = await this.simaClient.getItemBySid(row.sid);
          if (!itemResult.found) {
            return; // товар исчез у поставщика — отзывы не трогаем
          }
          const itemId = Number(itemResult.item.id);
          const commentsCount = Number(itemResult.item.comments_count ?? 0);
          if (!itemId || commentsCount <= 0) {
            // Отзывов нет — подчистить наши строки, если были
            touchedProductIds.add(row.productId);
            if (!dryRun) {
              removedCount += await this.externalReviewsRepository.removeMissing(
                row.productId,
                EXTERNAL_REVIEW_SOURCE,
                [],
              );
            }
            return;
          }

          await throttle();
          const comments = await this.fetchAllComments(itemId, throttle);
          productsWithComments++;

          const keepExternalIds: number[] = [];
          for (const comment of comments) {
            if (comment.item_comment_status_id !== PUBLISHED_STATUS_ID) continue;
            const rating = Number(comment.rating?.value ?? comment.rating_id);
            if (!(rating >= 1 && rating <= 5)) continue;
            keepExternalIds.push(comment.id);
            const outcome = await this.upsertComment(
              row.productId,
              row.sid,
              comment,
              rating,
              dryRun,
            );
            if (outcome === 'imported') importedCount++;
            if (outcome === 'updated') updatedCount++;
          }

          touchedProductIds.add(row.productId);
          if (!dryRun) {
            removedCount += await this.externalReviewsRepository.removeMissing(
              row.productId,
              EXTERNAL_REVIEW_SOURCE,
              keepExternalIds,
            );
          }
        } catch (error) {
          errors.push({
            product: `SL-${row.sid}`,
            error: (error as Error).message ?? String(error),
          });
        } finally {
          processed++;
          if (run && processed - flushedAt >= PROGRESS_FLUSH_EVERY) {
            flushedAt = processed;
            try {
              await this.dataSource
                .getRepository(ReviewsSyncRun)
                .update(run.id, {
                  processedProducts: processed,
                  importedCount,
                  updatedCount,
                  removedCount,
                });
            } catch {
              /* прогресс не критичен */
            }
          }
        }
      };

      await mapLimit(products, API_CONCURRENCY, processProduct);

      if (!dryRun) {
        await this.refreshExternalAggregates([...touchedProductIds]);
        // Комбинированный рейтинг — полный пересчёт (перезаливы у поставщика
        // могли убрать отзывы у товаров вне текущей выборки)
        await this.reviewsService.recalculateCombinedRatings();
        await this.reviewsService.invalidateReviewsCache();
      }

      const summary: ReviewsSyncSummary = {
        runId: run?.id,
        totalProducts: products.length,
        productsWithComments,
        importedCount,
        updatedCount,
        removedCount,
        errorCount: errors.length,
        dryRun,
        durationMs: Date.now() - startedAt,
      };

      if (run) {
        await this.dataSource.getRepository(ReviewsSyncRun).update(run.id, {
          status:
            processed > 0 && errors.length < products.length
              ? ReviewsSyncRunStatus.SUCCEEDED
              : ReviewsSyncRunStatus.FAILED,
          finishedAt: new Date(),
          totalProducts: products.length,
          processedProducts: processed,
          productsWithComments,
          importedCount,
          updatedCount,
          removedCount,
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
          .getRepository(ReviewsSyncRun)
          .update(run.id, {
            status: ReviewsSyncRunStatus.FAILED,
            finishedAt: new Date(),
            errorCount: errors.length + 1,
            errors: [
              ...errors.slice(0, 99),
              { product: '', error: (error as Error).message ?? String(error) },
            ],
          })
          .catch(() => undefined);
      }
      await this.unlock(runner);
      await runner.release().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Модели каталога Сималенда: товар = группа вариантов SL-{sid}; отзыв у
   * Сималенда групповой по модели, поэтому на товар достаточно одного sid
   * (минимального). REVIEWS_SYNC_SIDS="123,456" — прогнать подмножество
   * (диагностика/e2e).
   */
  private async loadSyncProducts(): Promise<SyncProductRow[]> {
    const rows = await this.variantsRepository
      .createQueryBuilder('v')
      .innerJoin(Product, 'p', 'p.id = v.productId')
      .where('v.sku LIKE :pattern', { pattern: 'SL-%' })
      .andWhere('p.status != :archived', { archived: 'archived' })
      .select('v.productId', 'productId')
      .addSelect('v.sku', 'sku')
      .getRawMany<{ productId: string; sku: string }>();

    const byProduct = new Map<string, number>();
    for (const row of rows) {
      const sid = parseSimaSid(row.sku);
      if (sid === null) continue;
      const current = byProduct.get(row.productId);
      if (current === undefined || sid < current) {
        byProduct.set(row.productId, sid);
      }
    }

    const all = [...byProduct.entries()].map(([productId, sid]) => ({
      productId,
      sid,
    }));
    const sidsFilter = (process.env.REVIEWS_SYNC_SIDS ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (sidsFilter.length === 0) return all;
    const allow = new Set(sidsFilter);
    return all.filter((row) => allow.has(row.sid));
  }

  /** Все страницы item-comment (переворачивает pageCount из _meta). */
  private async fetchAllComments(
    itemId: number,
    throttle: () => Promise<void>,
  ): Promise<SimaItemComment[]> {
    const result: SimaItemComment[] = [];
    const first = await this.simaClient.getItemComments(itemId, 1);
    result.push(...first.items);
    const pageCount = Math.min(first.pageCount, MAX_COMMENT_PAGES);
    for (let page = 2; page <= pageCount; page++) {
      await throttle();
      const next = await this.simaClient.getItemComments(itemId, page);
      result.push(...next.items);
      if (next.items.length === 0) break;
    }
    return result;
  }

  /** upsert по (source, externalId); возвращает 'imported' | 'updated' | 'same'. */
  private async upsertComment(
    productId: string,
    sid: number,
    comment: SimaItemComment,
    rating: number,
    dryRun: boolean,
  ): Promise<'imported' | 'updated' | 'same'> {
    const existing = await this.externalReviewsRepository.findByExternalId(
      EXTERNAL_REVIEW_SOURCE,
      comment.id,
    );

    const photoUrls = (comment.item_comment_photos ?? [])
      .map((photo) => photo.file_path_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, MAX_PHOTOS_PER_REVIEW);

    // Фото зеркалим только когда их стало другое количество (или отзыв новый)
    let images: string[] | undefined;
    if (photoUrls.length > 0) {
      const currentCount = existing?.images?.length ?? 0;
      if (!existing || currentCount !== photoUrls.length) {
        images = await this.mirrorPhotos(comment.id, photoUrls);
      }
    }

    const patch = {
      productId,
      itemSid: sid,
      rating,
      authorName: buildAuthorName(comment),
      message: (comment.message ?? '').trim(),
      pros: normalizeText(comment.pros),
      cons: normalizeText(comment.cons),
      reply: normalizeText(comment.message_reply),
      isVerifiedPurchase: Boolean(comment.has_item_purchased),
      sourceCreatedAt: parseSimaDate(comment.created_at),
    };

    if (dryRun) {
      return existing ? 'same' : 'imported';
    }

    if (existing) {
      const changed =
        existing.productId !== patch.productId ||
        existing.rating !== patch.rating ||
        existing.authorName !== patch.authorName ||
        existing.message !== patch.message ||
        (existing.pros ?? null) !== (patch.pros ?? null) ||
        (existing.cons ?? null) !== (patch.cons ?? null) ||
        (existing.reply ?? null) !== (patch.reply ?? null) ||
        existing.isVerifiedPurchase !== patch.isVerifiedPurchase ||
        (existing.sourceCreatedAt?.getTime() ?? null) !==
          (patch.sourceCreatedAt?.getTime() ?? null) ||
        (existing.images?.length ?? 0) !== (images?.length ?? photoUrls.length);
      if (!changed) return 'same';
      await this.externalReviewsRepository.save({
        ...existing,
        ...patch,
        ...(images ? { images } : {}),
      });
      return 'updated';
    }

    await this.externalReviewsRepository.save({
      externalId: comment.id,
      source: EXTERNAL_REVIEW_SOURCE,
      isHidden: false,
      images: images ?? [],
      ...patch,
    });
    return 'imported';
  }

  /** Зеркало фото отзыва в наш S3: reviews/{source}/{externalId}/{i}.{ext}. */
  private async mirrorPhotos(
    externalId: number,
    urls: string[],
  ): Promise<string[]> {
    const out: string[] = [];
    for (const [index, url] of urls.entries()) {
      try {
        const { buffer, contentType } = await this.simaClient.fetchFile(url);
        const ext = contentType.includes('png')
          ? 'png'
          : contentType.includes('webp')
            ? 'webp'
            : 'jpg';
        const key = `reviews/${EXTERNAL_REVIEW_SOURCE}/${externalId}/${index + 1}.${ext}`;
        await this.uploadService.uploadBuffer(
          buffer,
          key,
          contentType || 'image/jpeg',
        );
        out.push(this.uploadService.getFileUrl(key));
      } catch (error) {
        // Фото не скачалось — отзыв сохранится без него, не роняем прогон
        this.logger.warn(
          `фото отзыва ${externalId} #${index + 1}: ${(error as Error).message}`,
        );
      }
    }
    return out;
  }

  /** products.externalRating/externalReviewsCount/reviewsSyncedAt. */
  private async refreshExternalAggregates(productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    const stats = await this.externalReviewsRepository.ratingStats(productIds);
    for (const productId of productIds) {
      const entry = stats.get(productId);
      const externalRating = entry
        ? Math.round((entry.sum / entry.count) * 10) / 10
        : null;
      await this.productsRepository.updateExternalRating(
        productId,
        externalRating,
        entry?.count ?? 0,
      );
    }
  }
}

/** Connection, держащий advisory lock (queryRunner CLI/фонового прогона). */
interface QueryCarrier {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
  release(): Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** «Петрова Руфина Фаязовна» → «Петрова Р.»; анонимы — «Анонимно». */
function buildAuthorName(comment: SimaItemComment): string {
  if (comment.is_anonymously || !comment.user?.name) return 'Анонимно';
  const parts = comment.user.name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * '2025-06-28 23:32:36+05' → Date; мусор → null.
 * Сималенд отдаёт offset без минут (+05) — Date такое не парсит,
 * дополняем до ±HH:00.
 */
function parseSimaDate(value: string | undefined): Date | null {
  if (!value) return null;
  const normalized = value
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
