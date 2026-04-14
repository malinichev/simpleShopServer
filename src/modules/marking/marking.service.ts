import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MarkingCode, MarkingCodeStatus } from './entities/marking-code.entity';
import {
  CreateMarkingCodeDto,
  BulkCreateMarkingCodesDto,
  UpdateMarkingStatusDto,
  BulkUpdateMarkingStatusDto,
  MarkingQueryDto,
} from './dto';

const DATAMATRIX_REGEX = /^01(\d{14})21(.+?)(?:\x1d|$)/;

function parseDataMatrix(code: string): { gtin: string; serial: string } {
  const match = code.match(DATAMATRIX_REGEX);
  if (match) {
    return { gtin: match[1], serial: match[2] };
  }
  return { gtin: '', serial: '' };
}

@Injectable()
export class MarkingService {
  private readonly logger = new Logger(MarkingService.name);

  constructor(
    @InjectRepository(MarkingCode)
    private readonly repository: Repository<MarkingCode>,
  ) {}

  async findAll(query: MarkingQueryDto) {
    const { variantId, productId, status, page = 1, limit = 50 } = query;
    const qb = this.repository
      .createQueryBuilder('mc')
      .leftJoinAndSelect('mc.variant', 'variant')
      .leftJoin('variant.product', 'product');

    if (variantId) {
      qb.andWhere('mc.variantId = :variantId', { variantId });
    }
    if (productId) {
      qb.andWhere('variant.productId = :productId', { productId });
    }
    if (status) {
      qb.andWhere('mc.status = :status', { status });
    }

    qb.orderBy('mc.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

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

  async getStats(productId?: string, variantId?: string) {
    const qb = this.repository
      .createQueryBuilder('mc')
      .select('mc.status', 'status')
      .addSelect('COUNT(*)', 'count');

    if (variantId) {
      qb.andWhere('mc.variantId = :variantId', { variantId });
    } else if (productId) {
      qb.leftJoin('mc.variant', 'variant');
      qb.andWhere('variant.productId = :productId', { productId });
    }

    qb.groupBy('mc.status');
    const rows = await qb.getRawMany();

    const stats: Record<string, number> = {
      total: 0,
      in_stock: 0,
      reserved: 0,
      sold: 0,
      returned: 0,
      written_off: 0,
    };
    for (const row of rows) {
      const count = parseInt(row.count, 10);
      stats[row.status] = count;
      stats.total += count;
    }
    return stats;
  }

  /**
   * Пересчитать stock варианта по количеству кодов IN_STOCK.
   */
  async syncVariantStock(variantId: string): Promise<void> {
    await this.repository.query(
      `UPDATE product_variants
       SET stock = (
         SELECT COUNT(*)::int FROM marking_codes
         WHERE "variantId" = $1 AND status = 'in_stock'
       )
       WHERE id = $1`,
      [variantId],
    );
  }

  /**
   * Пересчитать stock для ВСЕХ вариантов продукта.
   */
  async syncProductStock(productId: string): Promise<void> {
    await this.repository.query(
      `UPDATE product_variants pv
       SET stock = (
         SELECT COUNT(*)::int FROM marking_codes mc
         WHERE mc."variantId" = pv.id AND mc.status = 'in_stock'
       )
       WHERE pv."productId" = $1`,
      [productId],
    );
  }

  async create(dto: CreateMarkingCodeDto): Promise<MarkingCode> {
    const existing = await this.repository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Код маркировки уже существует');
    }

    const { gtin, serial } = parseDataMatrix(dto.code);
    const entity = this.repository.create({
      variantId: dto.variantId,
      code: dto.code,
      gtin,
      serial,
      status: MarkingCodeStatus.IN_STOCK,
    });
    const saved = await this.repository.save(entity);
    await this.syncVariantStock(dto.variantId);
    return saved;
  }

  async bulkCreate(
    dto: BulkCreateMarkingCodesDto,
  ): Promise<{ created: number; duplicates: number }> {
    let created = 0;
    let duplicates = 0;

    for (const code of dto.codes) {
      const trimmed = code.trim();
      if (!trimmed) continue;

      const existing = await this.repository.findOne({
        where: { code: trimmed },
      });
      if (existing) {
        duplicates++;
        continue;
      }

      const { gtin, serial } = parseDataMatrix(trimmed);
      const entity = this.repository.create({
        variantId: dto.variantId,
        code: trimmed,
        gtin,
        serial,
        status: MarkingCodeStatus.IN_STOCK,
      });
      await this.repository.save(entity);
      created++;
    }

    await this.syncVariantStock(dto.variantId);
    return { created, duplicates };
  }

  async updateStatus(
    id: string,
    dto: UpdateMarkingStatusDto,
  ): Promise<MarkingCode> {
    const code = await this.repository.findOne({ where: { id } });
    if (!code) {
      throw new NotFoundException('Код маркировки не найден');
    }

    code.status = dto.status;
    code.orderId = dto.orderId ?? code.orderId;
    code.statusChangedAt = new Date();
    const saved = await this.repository.save(code);
    await this.syncVariantStock(code.variantId);
    return saved;
  }

  async bulkUpdateStatus(dto: BulkUpdateMarkingStatusDto): Promise<number> {
    // Собрать variantId до обновления для синхронизации stock
    const codes = await this.repository.find({
      where: { id: In(dto.ids) },
      select: ['variantId'],
    });
    const variantIds = [...new Set(codes.map((c) => c.variantId))];

    const result = await this.repository.update(
      { id: In(dto.ids) },
      {
        status: dto.status,
        orderId: dto.orderId ?? undefined,
        statusChangedAt: new Date(),
      },
    );

    for (const vid of variantIds) {
      await this.syncVariantStock(vid);
    }

    return result.affected ?? 0;
  }

  async delete(id: string): Promise<void> {
    const code = await this.repository.findOne({ where: { id } });
    if (!code) {
      throw new NotFoundException('Код маркировки не найден');
    }
    const { variantId } = code;
    await this.repository.remove(code);
    await this.syncVariantStock(variantId);
  }
}
