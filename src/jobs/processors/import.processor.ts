import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductsService } from '@/modules/products/products.service';
import { CategoriesService } from '@/modules/categories/categories.service';
import { UploadService } from '@/modules/upload/upload.service';
import {
  ImportJob,
  ImportJobStatus,
} from '@/modules/import/entities/import-job.entity';
import { ProductStatus } from '@/modules/products/entities/product.entity';

interface ImportJobData {
  jobId: string;
  fileKey: string;
  mapping: Record<string, string>;
  defaultStatus: string;
  skipDuplicates: boolean;
  duplicateResolutions?: Record<string, 'db' | 'csv'>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CsvRow {
  [key: string]: string;
}

@Processor('import')
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepo: Repository<ImportJob>,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  async process(job: Job<ImportJobData>): Promise<void> {
    const {
      jobId,
      fileKey,
      mapping,
      defaultStatus,
      skipDuplicates,
      duplicateResolutions,
    } = job.data;
    this.logger.log(`Processing import job ${jobId}`);

    await this.importJobRepo.update(jobId, {
      status: ImportJobStatus.PROCESSING,
    });

    try {
      // Download CSV from S3
      const buffer = await this.uploadService.getFileBuffer(fileKey);
      const content = buffer.toString('utf-8').replace(/^\uFEFF/, ''); // Remove BOM

      const records: string[][] = parse(content, {
        skip_empty_lines: true,
        relax_column_count: true,
      });

      if (records.length < 2) {
        await this.importJobRepo.update(jobId, {
          status: ImportJobStatus.FAILED,
          errors: [
            { row: 0, message: 'CSV файл пуст или содержит только заголовки' },
          ],
        });
        return;
      }

      const headers = records[0];
      const dataRows = records.slice(1);
      const errors: Array<{ row: number; field?: string; message: string }> =
        [];

      await this.importJobRepo.update(jobId, { totalRows: dataRows.length });

      // Build categories cache
      const categories = await this.categoriesService.findAll();
      const categoryMap = new Map<string, string>();
      for (const cat of categories) {
        categoryMap.set(cat.name.toLowerCase(), cat.id);
      }

      // Build duplicate resolution map: productId → 'db' | 'csv'
      // Also build reverse lookup: sku/name → existingProduct for matching
      const existingProductMap = new Map<
        string,
        { id: string; resolution: 'db' | 'csv' }
      >();
      if (
        duplicateResolutions &&
        Object.keys(duplicateResolutions).length > 0
      ) {
        const productIds = Object.keys(duplicateResolutions);
        for (const productId of productIds) {
          try {
            const product = await this.productsService.findById(productId);
            if (product.sku) {
              existingProductMap.set(`sku:${product.sku.toLowerCase()}`, {
                id: product.id,
                resolution: duplicateResolutions[productId],
              });
            }
            existingProductMap.set(`name:${product.name.toLowerCase()}`, {
              id: product.id,
              resolution: duplicateResolutions[productId],
            });
          } catch {
            // Product not found, skip
          }
        }
      }

      // Group rows by SKU (for multi-variant products)
      const groups = this.groupRowsBySku(headers, dataRows, mapping);

      let processedRows = 0;
      let successCount = 0;
      let errorCount = 0;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [groupKey, rows] of groups.entries()) {
        try {
          const firstRow = rows[0];
          const mapped = this.mapRow(headers, firstRow.data, mapping);

          // Resolve category
          let categoryId = '';
          const catName = mapped.categoryName;
          if (catName) {
            categoryId = categoryMap.get(catName.toLowerCase()) || '';
          }
          if (!categoryId) {
            errors.push({
              row: firstRow.rowNum,
              field: 'categoryName',
              message: `Категория "${catName}" не найдена`,
            });
            errorCount++;
            processedRows += rows.length;
            continue;
          }

          // Check if this CSV row matches an existing product with a resolution
          let existingMatch:
            | { id: string; resolution: 'db' | 'csv' }
            | undefined;
          if (mapped.sku) {
            existingMatch = existingProductMap.get(
              `sku:${mapped.sku.toLowerCase()}`,
            );
          }
          if (!existingMatch && mapped.name) {
            existingMatch = existingProductMap.get(
              `name:${mapped.name.toLowerCase()}`,
            );
          }

          // Build product DTO
          const productDto = {
            name: mapped.name || '',
            description: mapped.description || mapped.shortDescription || '',
            shortDescription: mapped.shortDescription || '',
            sku: mapped.sku || undefined,
            price: parseFloat(mapped.price) || 0,
            compareAtPrice: mapped.compareAtPrice
              ? parseFloat(mapped.compareAtPrice)
              : undefined,
            categoryId,
            status: (mapped.status || defaultStatus) as ProductStatus,
            tags: mapped.tags
              ? mapped.tags.split('|').map((t: string) => t.trim())
              : [],
            color: mapped.color || undefined,
            colorHex: mapped.colorHex || undefined,
            gtin: this.validateGtin(mapped.gtin, firstRow.rowNum, errors),
            images: this.buildImages(mapped),
            variants: this.buildVariants(headers, rows, mapping, errors),
            attributes: {
              material: mapped.material || '',
              activity: mapped.activity
                ? mapped.activity.split('|').map((a: string) => a.trim())
                : [],
              features: mapped.features
                ? mapped.features.split('|').map((f: string) => f.trim())
                : [],
            },
            seo: {
              title: mapped.seoTitle || mapped.name || '',
              description:
                mapped.seoDescription || mapped.shortDescription || '',
              keywords: [] as string[],
            },
          };

          if (existingMatch) {
            // Update existing product
            const updateDto: any = { ...productDto };
            // Remove sku to avoid uniqueness conflict on self-update
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            delete updateDto.sku;

            if (existingMatch.resolution === 'db') {
              // Keep name, description, images from DB — only update other fields
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              delete updateDto.name;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              delete updateDto.description;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              delete updateDto.shortDescription;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              delete updateDto.images;
            }
            // resolution === 'csv' → update everything from CSV (including name/description/images)

            await this.productsService.update(existingMatch.id, updateDto);
            successCount++;
          } else {
            // Create new product
            if (!productDto.name) {
              errors.push({
                row: firstRow.rowNum,
                field: 'name',
                message: 'Название обязательно',
              });
              errorCount++;
              processedRows += rows.length;
              continue;
            }

            await this.productsService.create(productDto as any);
            successCount++;
          }
        } catch (err: any) {
          const row = rows[0].rowNum;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
          const message = err?.message || 'Неизвестная ошибка';
          if (
            skipDuplicates &&
            !duplicateResolutions &&
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
            message.includes('уже существует')
          ) {
            // Skip duplicates silently (only if no explicit resolutions provided)
          } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            errors.push({ row, message });
            errorCount++;
          }
        }

        processedRows += rows.length;

        // Update progress every 10 groups
        if (processedRows % 10 === 0 || processedRows === dataRows.length) {
          await this.importJobRepo.update(jobId, {
            processedRows,
            successCount,
            errorCount,
            errors: errors.slice(0, 100), // Limit stored errors
          });
        }
      }

      await this.importJobRepo.update(jobId, {
        status: ImportJobStatus.COMPLETED,
        processedRows,
        successCount,
        errorCount,
        errors: errors.slice(0, 100),
      });

      this.logger.log(
        `Import ${jobId} completed: ${successCount} success, ${errorCount} errors`,
      );
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Import ${jobId} failed: ${err.message}`);
      await this.importJobRepo.update(jobId, {
        status: ImportJobStatus.FAILED,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
        errors: [{ row: 0, message: err.message || 'Ошибка обработки файла' }],
      });
    }
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

  private groupRowsBySku(
    headers: string[],
    rows: string[][],
    mapping: Record<string, string>,
  ): Map<string, Array<{ rowNum: number; data: string[] }>> {
    const skuIndex = Object.entries(mapping).find(
      ([, field]) => field === 'sku',
    );
    const nameIndex = Object.entries(mapping).find(
      ([, field]) => field === 'name',
    );

    const groups = new Map<string, Array<{ rowNum: number; data: string[] }>>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let key = '';

      if (skuIndex) {
        const colIdx = headers.indexOf(skuIndex[0]);
        key = colIdx !== -1 ? (row[colIdx] || '').trim() : '';
      }
      if (!key && nameIndex) {
        const colIdx = headers.indexOf(nameIndex[0]);
        key = colIdx !== -1 ? (row[colIdx] || '').trim() : '';
      }
      if (!key) key = `row-${i}`;

      const group = groups.get(key) || [];
      group.push({ rowNum: i + 2, data: row }); // +2 for header + 1-indexed
      groups.set(key, group);
    }

    return groups;
  }

  private buildImages(
    mapped: Record<string, string>,
  ): Array<{ id: string; url: string; alt: string; order: number }> {
    const images: Array<{
      id: string;
      url: string;
      alt: string;
      order: number;
    }> = [];

    for (let i = 1; i <= 5; i++) {
      const url = mapped[`imageUrl${i}`];
      if (url) {
        images.push({
          id: `img-${i}`,
          url,
          alt: mapped.name || '',
          order: i - 1,
        });
      }
    }
    return images;
  }

  private validateGtin(
    value: string | undefined,
    rowNum: number,
    errors: Array<{ row: number; field?: string; message: string }>,
  ): string | undefined {
    if (!value) return undefined;
    const cleaned = value.trim();
    if (!cleaned) return undefined;
    if (!/^\d{8,14}$/.test(cleaned)) {
      errors.push({
        row: rowNum,
        field: 'gtin',
        message: `Невалидный GTIN: "${cleaned}" (ожидается 8-14 цифр)`,
      });
      return undefined;
    }
    return cleaned;
  }

  private buildVariants(
    headers: string[],
    rows: Array<{ rowNum: number; data: string[] }>,
    mapping: Record<string, string>,
    errors: Array<{ row: number; field?: string; message: string }>,
  ): Array<{
    id: string;
    size: string;
    sku: string;
    stock: number;
    price?: number;
    gtin?: string;
  }> {
    const variants: Array<{
      id: string;
      size: string;
      sku: string;
      stock: number;
      price?: number;
      gtin?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const mapped = this.mapRow(headers, rows[i].data, mapping);
      const size = mapped.variantSize;
      if (!size) continue;

      variants.push({
        id: `var-${i}`,
        size,
        sku: mapped.variantSku || `${mapped.sku || 'PRD'}-${size}`,
        stock: parseInt(mapped.variantStock, 10) || 0,
        price: mapped.variantPrice
          ? parseFloat(mapped.variantPrice)
          : undefined,
        gtin: this.validateGtin(mapped.variantGtin, rows[i].rowNum, errors),
      });
    }

    return variants;
  }
}
