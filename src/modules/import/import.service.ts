import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { ImportJob, ImportJobStatus } from './entities/import-job.entity';
import { StartImportDto } from './dto';
import { UploadService } from '@/modules/upload/upload.service';

const CSV_TEMPLATE_COLUMNS = [
  'name',
  'shortDescription',
  'description',
  'sku',
  'price',
  'compareAtPrice',
  'categoryName',
  'material',
  'activity',
  'features',
  'color',
  'colorHex',
  'status',
  'tags',
  'gtin',
  'imageUrl1',
  'imageUrl2',
  'variantSize',
  'variantSku',
  'variantStock',
  'variantPrice',
  'variantGtin',
  'seoTitle',
  'seoDescription',
];

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(ImportJob)
    private readonly repository: Repository<ImportJob>,
    @InjectQueue('import')
    private readonly importQueue: Queue,
    private readonly uploadService: UploadService,
  ) {}

  async preview(fileBuffer: Buffer): Promise<{
    headers: string[];
    rows: string[][];
    totalRows: number;
  }> {
    const content = fileBuffer.toString('utf-8');
    const records: string[][] = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
    });

    if (records.length === 0) {
      throw new BadRequestException('CSV файл пуст');
    }

    const headers = records[0];
    const dataRows = records.slice(1);

    return {
      headers,
      rows: dataRows.slice(0, 5),
      totalRows: dataRows.length,
    };
  }

  async start(
    dto: StartImportDto,
    userId: string,
  ): Promise<ImportJob> {
    const job = this.repository.create({
      status: ImportJobStatus.PENDING,
      fileName: dto.fileKey.split('/').pop() || 'import.csv',
      fileKey: dto.fileKey,
      columnMapping: dto.mapping,
      createdBy: userId,
    });
    const saved = await this.repository.save(job);

    await this.importQueue.add('process-import', {
      jobId: saved.id,
      fileKey: dto.fileKey,
      mapping: dto.mapping,
      defaultStatus: dto.defaultStatus || 'draft',
      skipDuplicates: dto.skipDuplicates ?? true,
    });

    return saved;
  }

  async findJobs(page = 1, limit = 20) {
    const [data, total] = await this.repository.findAndCount({
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

  async findJob(id: string): Promise<ImportJob> {
    const job = await this.repository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('Задача импорта не найдена');
    }
    return job;
  }

  async updateJob(id: string, data: Partial<ImportJob>): Promise<void> {
    await this.repository.update(id, data);
  }

  getTemplate(): string {
    return CSV_TEMPLATE_COLUMNS.join(',') + '\n';
  }
}
