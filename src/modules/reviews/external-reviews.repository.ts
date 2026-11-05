import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalReview } from './entities/external-review.entity';

@Injectable()
export class ExternalReviewsRepository {
  constructor(
    @InjectRepository(ExternalReview)
    private readonly repository: Repository<ExternalReview>,
  ) {}

  /** Все нескрытые отзывы товара (для склейки в ReviewsService.findByProduct). */
  async findVisibleByProduct(productId: string): Promise<ExternalReview[]> {
    return this.repository.find({
      where: { productId, isHidden: false },
      order: { sourceCreatedAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<ExternalReview | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByExternalId(
    source: string,
    externalId: number,
  ): Promise<ExternalReview | null> {
    return this.repository.findOne({ where: { source, externalId } });
  }

  async save(review: Partial<ExternalReview>): Promise<ExternalReview> {
    return this.repository.save(review);
  }

  /**
   * Удалить отзывы товара, которых больше нет у поставщика (ре-синк).
   * Пустой keepIds — удалить все строки товара этого источника.
   */
  async removeMissing(
    productId: string,
    source: string,
    keepExternalIds: number[],
  ): Promise<number> {
    const qb = this.repository
      .createQueryBuilder()
      .delete()
      .where('productId = :productId', { productId })
      .andWhere('source = :source', { source });
    if (keepExternalIds.length > 0) {
      qb.andWhere('externalId NOT IN (:...keepExternalIds)', {
        keepExternalIds,
      });
    }
    const result = await qb.execute();
    return result.affected ?? 0;
  }

  async setHidden(id: string, isHidden: boolean): Promise<void> {
    await this.repository.update(id, { isHidden });
  }

  /** Список для админки (пагинация + фильтр рейтинга), новые сверху. */
  async findForAdmin(query: {
    page: number;
    limit: number;
    rating?: number;
  }): Promise<{ data: ExternalReview[]; total: number }> {
    const qb = this.repository
      .createQueryBuilder('er')
      .orderBy('er.sourceCreatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.rating) {
      qb.andWhere('er.rating = :rating', { rating: query.rating });
    }
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /**
   * Агрегаты нескрытых внешних отзывов по товарам: productId → {count, sum}.
   * Используется вместе с ReviewsRepository.ratingStats для комбинированного
   * рейтинга товара.
   */
  async ratingStats(
    productIds?: string[],
  ): Promise<Map<string, { count: number; sum: number }>> {
    const qb = this.repository
      .createQueryBuilder('er')
      .select('er.productId', 'productId')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('SUM(er.rating)', 'total')
      .where('er.isHidden = false')
      .groupBy('er.productId');
    if (productIds) {
      qb.andWhere('er.productId IN (:...productIds)', { productIds });
    }
    const rows = await qb.getRawMany<{
      productId: string;
      cnt: string;
      total: string;
    }>();
    return new Map(
      rows.map((row) => [
        row.productId,
        { count: Number(row.cnt), sum: Number(row.total) },
      ]),
    );
  }

  /** Товары с внешними отзывами (включая скрытые) — для пересчёта агрегатов. */
  async productIdsWithReviews(): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('er')
      .select('DISTINCT er.productId', 'productId')
      .getRawMany<{ productId: string }>();
    return rows.map((row) => row.productId);
  }
}
