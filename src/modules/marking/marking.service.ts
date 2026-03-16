import {
  Injectable,
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
    return this.repository.save(entity);
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
    return this.repository.save(code);
  }

  async bulkUpdateStatus(dto: BulkUpdateMarkingStatusDto): Promise<number> {
    const result = await this.repository.update(
      { id: In(dto.ids) },
      {
        status: dto.status,
        orderId: dto.orderId ?? undefined,
        statusChangedAt: new Date(),
      },
    );
    return result.affected ?? 0;
  }

  async delete(id: string): Promise<void> {
    const code = await this.repository.findOne({ where: { id } });
    if (!code) {
      throw new NotFoundException('Код маркировки не найден');
    }
    await this.repository.remove(code);
  }
}
