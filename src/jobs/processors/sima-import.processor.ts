import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SimaImportService } from '@/modules/sima-import/sima-import.service';
import { ModelLinksService } from '@/modules/sima-import/model-links.service';
import {
  SimaImportJob,
  SimaImportJobStatus,
  SimaImportPhase,
} from '@/modules/sima-import/entities/sima-import-job.entity';
import type { SimaExportRow } from '@/modules/sima-import/sima-export.parser';
import {
  mapStoreCategory,
  colorHexFor,
  pricePairFor,
  wholesaleBase,
  variantPriceFor,
} from '@/modules/sima-import/sima-import.utils';
import { modelIdFromKey } from './import.processor';
import { CategoriesService } from '@/modules/categories/categories.service';
import { ProductsService } from '@/modules/products/products.service';
import { UploadService } from '@/modules/upload/upload.service';
import { assertFetchableApiUrl } from '@/modules/stock-sync/stock-sync.utils';
import * as http from 'node:http';
import * as https from 'node:https';

export interface SimaImportJobData {
  jobId: string;
  fileKey: string;
  onlyWomen: boolean;
}

const IMAGE_CONCURRENCY = 4;
/** Хосты, которые разрешено зеркалировать (CDN фото Сималенда). */
const MIRROR_HOST_ALLOWLIST = ['goods-photos.static1-sima-land.com'];
const PROGRESS_FLUSH_EVERY = 10;
const MAX_ERRORS = 100;

/**
 * Фоновая загрузка выгрузки Сималенда: склейка цветов (скрейп «Вариантов»)
 * → зеркалирование картинок в наш S3 → создание/обновление товаров со
 * связкой modelId = uuidv5(modelKey) — тот же namespace, что у CSV-импорта.
 */
@Processor('sima-import')
export class SimaImportProcessor extends WorkerHost {
  private readonly logger = new Logger(SimaImportProcessor.name);

  constructor(
    @InjectRepository(SimaImportJob)
    private readonly jobRepo: Repository<SimaImportJob>,
    private readonly simaImportService: SimaImportService,
    private readonly modelLinks: ModelLinksService,
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  async process(job: Job<SimaImportJobData>): Promise<void> {
    const { jobId, fileKey, onlyWomen } = job.data;
    const startedAt = new Date();
    await this.jobRepo.update(jobId, {
      status: SimaImportJobStatus.PROCESSING,
      startedAt,
    });
    const errors: Array<{ row: string; message: string }> = [];
    let created = 0;
    let updated = 0;

    try {
      const rows = await this.filterRows(fileKey, onlyWomen, errors);
      await this.jobRepo.update(jobId, { totalItems: rows.length });

      // ---------- фаза 1: склейка ----------
      await this.jobRepo.update(jobId, { phase: SimaImportPhase.SCRAPE });
      const links = await this.modelLinks.resolveModelLinks(
        rows.map((r) => r.sid),
        async (done, total) => {
          await this.jobRepo.update(jobId, { scrapeDone: done, scrapeTotal: total });
        },
      );

      if (await this.isCanceled(jobId)) {
        await this.finish(jobId, SimaImportJobStatus.CANCELED, { createdCount: created, updatedCount: updated, errorCount: errors.length, errors: errors.slice(0, MAX_ERRORS) });
        return;
      }

      // ---------- фаза 2: картинки ----------
      const categoryMap = await this.buildCategoryMap();
      const { dtoByRow, imagesTotal } = await this.buildDtos(rows, links, categoryMap, errors);

      await this.jobRepo.update(jobId, {
        phase: SimaImportPhase.IMAGES,
        imagesTotal,
      });
      let imagesDone = 0;
      const toMirror = dtoByRow
        .map(({ images }) => images)
        .flat()
        .filter((img) => this.isMirrorable(img.url));
      await mapLimit(toMirror, IMAGE_CONCURRENCY, async (img) => {
        try {
          const mirrored = await this.mirrorImage(img.url);
          if (mirrored) {
            img.url = mirrored;
          }
        } catch (error) {
          this.logger.warn(`зеркало ${img.url}: ${(error as Error).message}`);
        }
        imagesDone++;
        if (imagesDone % PROGRESS_FLUSH_EVERY === 0 || imagesDone === toMirror.length) {
          await this.jobRepo.update(jobId, { imagesDone });
        }
      });
      await this.jobRepo.update(jobId, { imagesDone });

      if (await this.isCanceled(jobId)) {
        await this.finish(jobId, SimaImportJobStatus.CANCELED, { createdCount: created, updatedCount: updated, errorCount: errors.length, errors: errors.slice(0, MAX_ERRORS) });
        return;
      }

      // ---------- фаза 3: товары ----------
      await this.jobRepo.update(jobId, { phase: SimaImportPhase.PRODUCTS });
      const existingProducts = await this.loadExisting(rows);
      let processed = 0;

      for (const { row, dto } of dtoByRow) {
        try {
          const existing = existingProducts.get(`SL-${row.sid}`);
          if (existing) {
            // обновляем цены/остатки/варианты/фото/описание; ручную связь не трогаем
            const updateDto: Record<string, unknown> = { ...dto };
            delete updateDto.sku;
            updateDto.modelId = existing.modelId || dto.modelId;
            await this.productsService.update(existing.id, updateDto as never);
            updated++;
          } else {
            await this.productsService.create(dto as never);
            created++;
          }
        } catch (error) {
          errors.push({ row: `SL-${row.sid}`, message: (error as Error).message });
        }
        processed++;
        if (processed % PROGRESS_FLUSH_EVERY === 0 || processed === dtoByRow.length) {
          await this.jobRepo.update(jobId, {
            processedItems: processed,
            createdCount: created,
            updatedCount: updated,
            errorCount: errors.length,
            errors: errors.slice(0, MAX_ERRORS),
          });
          if (errors.length > 0 && await this.isCanceled(jobId)) {
            await this.finish(jobId, SimaImportJobStatus.CANCELED, { createdCount: created, updatedCount: updated, errorCount: errors.length, errors: errors.slice(0, MAX_ERRORS) });
            return;
          }
        }
      }

      await this.productsService.invalidateCache();
      await this.finish(jobId, SimaImportJobStatus.COMPLETED, {
        createdCount: created,
        updatedCount: updated,
        errorCount: errors.length,
        errors: errors.slice(0, MAX_ERRORS),
      });
      this.logger.log(
        `Sima-импорт ${jobId}: +${created} / ~${updated} / ошибок ${errors.length}`,
      );
    } catch (error) {
      this.logger.error(`Sima-импорт ${jobId} упал: ${(error as Error).message}`);
      await this.finish(jobId, SimaImportJobStatus.FAILED, {
        errorCount: errors.length + 1,
        errors: [
          ...errors.slice(0, MAX_ERRORS - 1),
          { row: '-', message: (error as Error).message },
        ],
      });
    }
  }

  private async filterRows(
    fileKey: string,
    onlyWomen: boolean,
    errors: Array<{ row: string; message: string }>,
  ): Promise<SimaExportRow[]> {
    const all = await this.simaImportService.readRows(fileKey);
    return all.filter((row) => {
      if (onlyWomen && (row.genderCategory === 'Мужская одежда' || row.genderCategory === 'Детская одежда')) {
        return false;
      }
      if (!row.title) {
        errors.push({ row: String(row.rowNum), message: 'Пустой заголовок' });
        return false;
      }
      return true;
    });
  }

  private async buildCategoryMap(): Promise<Map<string, string>> {
    const categories = await this.categoriesService.findAll();
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.name.toLowerCase(), cat.id);
    }
    return map;
  }

  private async buildDtos(
    rows: SimaExportRow[],
    links: { keys: Map<number, number>; colors: Map<number, string> },
    categoryMap: Map<string, string>,
    errors: Array<{ row: string; message: string }>,
  ) {
    const dtoByRow: Array<{ row: SimaExportRow; dto: Record<string, unknown>; images: Array<{ id: string; url: string; alt: string; order: number }> }> = [];

    for (const row of rows) {
      const storeCategory = mapStoreCategory(row);
      const categoryId = storeCategory ? categoryMap.get(storeCategory.toLowerCase()) : undefined;
      if (!categoryId) {
        errors.push({
          row: `SL-${row.sid}`,
          message: `Категория не сопоставлена (${row.subCategory || 'без категории'})`,
        });
        continue;
      }

      const base = wholesaleBase(row);
      const { price, compareAt } = pricePairFor(base);
      const color = links.colors.get(row.sid) || row.color;
      const modelKey = links.keys.get(row.sid);
      const modelId = modelKey !== undefined ? modelIdFromKey(String(modelKey)) : undefined;

      const images = row.images.map((url, i) => ({
        id: `img-${i + 1}`,
        url,
        alt: row.title,
        order: i,
      }));

      const sizes = row.sizes.length
        ? row.sizes
        : [{ size: 'Один размер', sid: row.sid as number | undefined, price: undefined, stock: row.stock }];

      const dto: Record<string, unknown> = {
        name: row.title,
        shortDescription: [row.manufacturer, row.composition].filter(Boolean).join(', '),
        description: row.description || [row.manufacturer, row.composition].filter(Boolean).join(', '),
        sku: `SL-${row.sid}`,
        price,
        compareAtPrice: compareAt,
        categoryId,
        color,
        colorHex: colorHexFor(color),
        modelId,
        status: 'active',
        tags: row.manufacturer ? [row.manufacturer] : [],
        gtin: /^\d{8,14}$/.test(row.barcode) ? row.barcode : undefined,
        images,
        variants: sizes.map((s) => ({
          size: s.size || 'Один размер',
          sku: s.sid ? `SL-${s.sid}` : `SL-${row.sid}-${(s.size || 'one').replace(/\s+/g, '')}`,
          stock: s.stock ?? 0,
          price: variantPriceFor(s.price ?? 0, row),
        })),
        attributes: {
          material: row.composition || row.fabric || '',
          activity: [],
          features: row.fabric ? [row.fabric] : [],
        },
        seo: {
          title: `${row.title} — купить в svoybrand`,
          description: `${row.title}. ${row.composition || ''}`.trim(),
          keywords: [],
        },
      };
      dtoByRow.push({ row, dto, images });
    }

    const imagesTotal = dtoByRow
      .map(({ images }) => images.filter((i) => this.isMirrorable(i.url)).length)
      .reduce((a, b) => a + b, 0);
    return { dtoByRow, imagesTotal };
  }

  private isMirrorable(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return MIRROR_HOST_ALLOWLIST.includes(hostname);
    } catch {
      return false;
    }
  }

  /** Скачивание фото CDN → наш S3; возвращает наш URL (или null = не удалось). */
  private async mirrorImage(url: string): Promise<string | null> {
    assertFetchableApiUrl(url);
    const buffer = await fetchBinary(url);
    // https://goods-photos.static1-sima-land.com/items/<id>/<n>/700-nw.jpg
    // → products/sima/<id>/<n>.jpg (стабильный ключ: повторное зеркало — no-op)
    const parts = url.split('/');
    const itemDir = parts[parts.length - 3];
    const photoDir = parts[parts.length - 2];
    const ext = (parts[parts.length - 1].match(/\.(jpe?g|png|webp)$/i)?.[1] || 'jpg').toLowerCase();
    const key = `products/sima/${itemDir}/${photoDir}.${ext}`;
    await this.uploadService.uploadBuffer(buffer, key, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    return this.uploadService.getFileUrl(key);
  }

  private async loadExisting(
    rows: SimaExportRow[],
  ): Promise<Map<string, { id: string; modelId: string | null }>> {
    const skus = rows.map((r) => `SL-${r.sid}`);
    const products = skus.length
      ? await this.productsService.findBySkus(skus)
      : [];
    const map = new Map<string, { id: string; modelId: string | null }>();
    for (const p of products) {
      map.set(p.sku!, { id: p.id, modelId: (p as { modelId?: string | null }).modelId ?? null });
    }
    return map;
  }

  private async isCanceled(jobId: string): Promise<boolean> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId },
      select: ['cancelRequested'] as never,
    });
    return Boolean(job?.cancelRequested);
  }

  private async finish(
    jobId: string,
    status: SimaImportJobStatus,
    data: Partial<SimaImportJob>,
  ): Promise<void> {
    await this.jobRepo.update(jobId, {
      ...data,
      status,
      phase: SimaImportPhase.DONE,
      finishedAt: new Date(),
    });
  }
}

/** Простейший ограниченный параллелизм (паттерн stock-sync.service). */
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

/** Бинарное скачивание (node:http(s), как SimaLandClient). */
function fetchBinary(url: string, timeoutMs = 20_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.request(
      url,
      {
        headers: {
          Accept: 'image/*',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          fetchBinary(next, timeoutMs).then(resolve, reject);
          return;
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error: Error) => reject(error));
    req.end();
  });
}
