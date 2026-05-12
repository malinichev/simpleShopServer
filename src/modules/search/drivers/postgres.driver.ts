import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product, ProductStatus } from '@/modules/products/entities/product.entity';
import {
  SearchDriver,
  SearchProductsInput,
  SearchProductsResult,
} from './search-driver.interface';

/**
 * Default search driver — Postgres ILIKE по `name`/`description`.
 *
 * Это та же логика, что лежала inline в `ProductsRepository.search`.
 * Без внешних зависимостей; работает на любой инсталляции.
 *
 * Если магазину нужны: морфология русского, опечатки, ranking — переходи на
 * MeiliSearch / Typesense / Elastic (см. `meilisearch.driver.ts`).
 */
@Injectable()
export class PostgresSearchDriver implements SearchDriver {
  readonly name = 'postgres' as const;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async searchProducts(
    input: SearchProductsInput,
  ): Promise<SearchProductsResult> {
    const { term, limit, filters } = input;
    const onlyActive = filters?.onlyActive ?? true;
    const pattern = `%${term}%`;

    const where = onlyActive
      ? [
          {
            name: ILike(pattern),
            status: ProductStatus.ACTIVE,
            isVisible: true,
          },
          {
            description: ILike(pattern),
            status: ProductStatus.ACTIVE,
            isVisible: true,
          },
        ]
      : [{ name: ILike(pattern) }, { description: ILike(pattern) }];

    const items = await this.productRepository.find({
      where,
      relations: ['variants'],
      take: limit,
      order: { soldCount: 'DESC' },
    });

    return { items };
  }

  // Postgres = источник истины, отдельный индекс не нужен.
  async indexProduct(): Promise<void> {}
  async removeProduct(): Promise<void> {}
  async reindexAll(): Promise<void> {}
}
