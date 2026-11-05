import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  SimaImportJob,
  SimaImportJobStatus,
  SimaImportPhase,
} from './entities/sima-import-job.entity';
import { parseSimaExport, SimaExportRow } from './sima-export.parser';
import { mapStoreCategory } from './sima-import.utils';
import { ModelLinksService } from './model-links.service';
import { UploadService } from '@/modules/upload/upload.service';
import { ProductsService } from '@/modules/products/products.service';

export interface SimaPreviewResult {
  fileKey: string;
  fileName: string;
  totalRows: number;
  parsedRows: number;
  skippedNoSid: number;
  womenRows: number;
  existingSkus: number;
  categories: Array<{ category: string; count: number }>;
  unmapped: number;
  linkedByCache: number;
  sample: Array<{ sid: number; title: string; color: string }>;
}

/**
 * Задача считается зависшей, если воркер давно не отзывал прогресс: процессор
 * пишет прогресс минимум раз в ~20с (каждая страница склейки / каждые 10
 * картинок-товаров), поэтому 90с тишины = воркер мёртв (перезапуск сервера).
 */
const STALE_PROCESSING_MS = 90_000;

@Injectable()
export class SimaImportService implements OnModuleInit {
  private readonly logger = new Logger(SimaImportService.name);

  /**
   * Жнец при старте: единственный воркер обрабатывает очередь, значит любая
   * задача в processing после (пере)запуска сервера — осиротевшая. Помечаем
   * failed, чтобы не висела «выполняется» вечно (как у зомби после рестарта).
   */
  async onModuleInit(): Promise<void> {
    const zombies = await this.jobsRepo.find({
      where: { status: SimaImportJobStatus.PROCESSING },
    });
    for (const job of zombies) {
      await this.jobsRepo.update(job.id, {
        status: SimaImportJobStatus.FAILED,
        phase: SimaImportPhase.DONE,
        finishedAt: new Date(),
        errorCount: job.errorCount + 1,
        errors: [
          ...job.errors.slice(0, 99),
          { row: '-', message: 'Воркер перезапущен — задача прервана, перезапустите загрузку' },
        ],
      });
      this.logger.warn(`зомби-задача ${job.id} помечена failed после рестарта воркера`);
    }
  }

  constructor(
    @InjectRepository(SimaImportJob)
    private readonly jobsRepo: Repository<SimaImportJob>,
    @InjectQueue('sima-import')
    private readonly queue: Queue,
    private readonly uploadService: UploadService,
    private readonly productsService: ProductsService,
    private readonly modelLinks: ModelLinksService,
  ) {}

  /** Разбор выгрузки + саммари + файл в S3. Без скрейпа (быстро). */
  async preview(file: Express.Multer.File): Promise<SimaPreviewResult> {
    if (!file) {
      throw new BadRequestException('CSV файл не предоставлен');
    }
    if (!/\.(csv|xls)$/i.test(file.originalname)) {
      throw new BadRequestException('Допускаются только CSV файлы Сималенда');
    }

    const parsed = parseSimaExport(file.buffer);
    const rows = parsed.rows.filter(
      (r) => r.genderCategory !== 'Мужская одежда' && r.genderCategory !== 'Детская одежда',
    );

    const categoryCounts = new Map<string, number>();
    let unmapped = 0;
    for (const row of rows) {
      const category = mapStoreCategory(row);
      if (category) {
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
      } else {
        unmapped++;
      }
    }

    const skus = rows.map((r) => `SL-${r.sid}`);
    const existing = skus.length
      ? await this.productsService.findBySkus(skus)
      : [];

    const cached = await this.modelLinks.cachedLinks(rows.map((r) => r.sid));

    const fileName = file.originalname.replace(/[^\wА-Яа-яЁё.-]/g, '_');
    const fileKey = `sima-imports/${Date.now()}-${fileName}`;
    await this.uploadService.uploadBuffer(file.buffer, fileKey, 'text/csv');

    return {
      fileKey,
      fileName,
      totalRows: parsed.totalRows,
      parsedRows: parsed.rows.length,
      skippedNoSid: parsed.skippedNoSid,
      womenRows: rows.length,
      existingSkus: existing.length,
      categories: [...categoryCounts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      unmapped,
      linkedByCache: rows.filter((r) => cached.keys.has(r.sid)).length,
      sample: rows.slice(0, 5).map((r) => ({ sid: r.sid, title: r.title, color: r.color })),
    };
  }

  async start(
    fileKey: string,
    onlyWomen: boolean,
    userId: string,
  ): Promise<SimaImportJob> {
    const job = this.jobsRepo.create({
      status: SimaImportJobStatus.PENDING,
      fileName: fileKey.split('/').pop() || 'sima-export.csv',
      fileKey,
      options: { onlyWomen },
      createdBy: userId,
    });
    const saved = await this.jobsRepo.save(job);
    await this.queue.add('process-sima-import', {
      jobId: saved.id,
      fileKey,
      onlyWomen,
    });
    return saved;
  }

  async findJobs(page = 1, limit = 20) {
    const [data, total] = await this.jobsRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async findJob(id: string): Promise<SimaImportJob> {
    const job = await this.jobsRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('Задача загрузки не найдена');
    }
    return job;
  }

  /** Активная (незавершённая) задача для индикатора в шапке админки. */
  async findActiveJob(): Promise<SimaImportJob | null> {
    return this.jobsRepo.findOne({
      where: { status: SimaImportJobStatus.PROCESSING },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Отмена: живому воркеру ставим флаг (он завершит сам с итогами), а зависшую
   * задачу (прогресс молчит дольше STALE_PROCESSING_MS — воркер умер) финализируем
   * сразу, иначе «выполняется» висит вечно и её нечем убить.
   */
  async requestCancel(id: string): Promise<SimaImportJob> {
    const job = await this.findJob(id);
    if (
      job.status === SimaImportJobStatus.PROCESSING ||
      job.status === SimaImportJobStatus.PENDING
    ) {
      const silentMs = Date.now() - new Date(job.updatedAt).getTime();
      if (silentMs > STALE_PROCESSING_MS) {
        await this.jobsRepo.update(id, {
          status: SimaImportJobStatus.CANCELED,
          cancelRequested: true,
          phase: SimaImportPhase.DONE,
          finishedAt: new Date(),
        });
        this.logger.warn(
          `задача ${id} отменена принудительно: прогресс молчал ${Math.round(silentMs / 1000)}с`,
        );
      } else {
        await this.jobsRepo.update(id, { cancelRequested: true });
      }
      return this.findJob(id);
    }
    return job;
  }

  /** Чтение файла джобой (процессором). */
  async readRows(fileKey: string): Promise<SimaExportRow[]> {
    const buffer = await this.uploadService.getFileBuffer(fileKey);
    const parsed = parseSimaExport(buffer);
    return parsed.rows;
  }

  async updateJob(id: string, data: Partial<SimaImportJob>): Promise<void> {
    await this.jobsRepo.update(id, data);
  }
}
