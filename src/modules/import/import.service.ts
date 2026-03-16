import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { ImportJob, ImportJobStatus } from './entities/import-job.entity';
import { StartImportDto, DetectDuplicatesDto } from './dto';
import { UploadService } from '@/modules/upload/upload.service';
import { ProductsService } from '@/modules/products/products.service';
import { Product } from '@/modules/products/entities/product.entity';

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
    private readonly productsService: ProductsService,
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

  async start(dto: StartImportDto, userId: string): Promise<ImportJob> {
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
      duplicateResolutions: dto.duplicateResolutions,
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

  async detectDuplicates(dto: DetectDuplicatesDto) {
    // Download and parse CSV from S3
    const buffer = await this.uploadService.getFileBuffer(dto.fileKey);
    const content = buffer.toString('utf-8').replace(/^\uFEFF/, '');

    const records: string[][] = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
    });

    if (records.length < 2) {
      return { duplicates: [], newProductsCount: 0, totalCsvRows: 0 };
    }

    const headers = records[0];
    const dataRows = records.slice(1);

    // Extract SKUs and names from CSV using mapping
    const csvItems: Array<{ rowNum: number; sku: string; name: string }> = [];
    for (let i = 0; i < dataRows.length; i++) {
      const mapped = this.mapRow(headers, dataRows[i], dto.mapping);
      csvItems.push({
        rowNum: i + 2, // +2: 1-indexed + header row
        sku: mapped.sku || '',
        name: mapped.name || '',
      });
    }

    // Deduplicate by SKU (for multi-variant rows, only keep first)
    const seenSkus = new Set<string>();
    const uniqueItems: typeof csvItems = [];
    for (const item of csvItems) {
      const key = item.sku || item.name || `row-${item.rowNum}`;
      if (!seenSkus.has(key)) {
        seenSkus.add(key);
        uniqueItems.push(item);
      }
    }

    // Collect non-empty SKUs and names for DB lookup
    const skus = uniqueItems.map((r) => r.sku).filter(Boolean);
    const names = uniqueItems.map((r) => r.name).filter(Boolean);

    // Find matching products in DB
    const matchedProducts: Product[] = [];
    if (skus.length > 0) {
      const bySkuResults = await this.productsService.findBySkus(skus);
      matchedProducts.push(...bySkuResults);
    }
    if (names.length > 0) {
      const existingIds = new Set(matchedProducts.map((p) => p.id));
      const byNameResults = await this.productsService.findByNames(names);
      for (const p of byNameResults) {
        if (!existingIds.has(p.id)) {
          matchedProducts.push(p);
        }
      }
    }

    // Build lookup maps
    const productBySku = new Map<string, Product>();
    const productByName = new Map<string, Product>();
    for (const p of matchedProducts) {
      if (p.sku) productBySku.set(p.sku.toLowerCase(), p);
      productByName.set(p.name.toLowerCase(), p);
    }

    // Match CSV rows to DB products
    const duplicates: Array<{
      csvRowNum: number;
      csvName: string;
      csvSku: string;
      matchedBy: 'sku' | 'name';
      product: {
        id: string;
        name: string;
        sku: string;
        description: string;
        shortDescription: string;
        images: any[];
      };
    }> = [];

    const matchedProductIds = new Set<string>();
    for (const item of uniqueItems) {
      let match: Product | undefined;
      let matchedBy: 'sku' | 'name' = 'sku';

      if (item.sku) {
        match = productBySku.get(item.sku.toLowerCase());
      }
      if (!match && item.name) {
        match = productByName.get(item.name.toLowerCase());
        matchedBy = 'name';
      }

      if (match && !matchedProductIds.has(match.id)) {
        matchedProductIds.add(match.id);
        duplicates.push({
          csvRowNum: item.rowNum,
          csvName: item.name,
          csvSku: item.sku,
          matchedBy,
          product: {
            id: match.id,
            name: match.name,
            sku: match.sku || '',
            description: match.description || '',
            shortDescription: match.shortDescription || '',
            images: match.images || [],
          },
        });
      }
    }

    return {
      duplicates,
      newProductsCount: uniqueItems.length - duplicates.length,
      totalCsvRows: dataRows.length,
    };
  }

  private mapRow(
    headers: string[],
    row: string[],
    mapping: Record<string, string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [csvCol, field] of Object.entries(mapping)) {
      const colIndex = headers.indexOf(csvCol);
      if (colIndex !== -1 && row[colIndex] !== undefined) {
        result[field] = row[colIndex].trim();
      }
    }
    return result;
  }

  getTemplate(): string {
    return CSV_TEMPLATE_COLUMNS.join(',') + '\n';
  }
}
