import { Inject, Injectable, Logger } from '@nestjs/common';
import { Product } from '@/modules/products/entities/product.entity';
import {
  SEARCH_DRIVER,
  SearchDriver,
  SearchProductsInput,
  SearchProductsResult,
} from './drivers';

/**
 * Facade над `SearchDriver`. Используется из `ProductsService.search` и
 * hooks create/update/delete для синхронизации внешнего индекса.
 *
 * Драйвер выбирается через env `SEARCH_DRIVER` (см. `search.module.ts`).
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SEARCH_DRIVER) private readonly driver: SearchDriver,
  ) {
    this.logger.log(`Search driver active: ${driver.name}`);
  }

  getDriverName(): string {
    return this.driver.name;
  }

  async searchProducts(
    input: SearchProductsInput,
  ): Promise<SearchProductsResult> {
    if (!input.term || input.term.trim().length < 2) {
      return { items: [] };
    }
    return this.driver.searchProducts({ ...input, term: input.term.trim() });
  }

  /** Hook после create/update товара. Postgres = no-op, MeiliSearch = upsert в индекс. */
  async onProductSaved(product: Product): Promise<void> {
    try {
      await this.driver.indexProduct?.(product);
    } catch (error) {
      this.logger.warn(
        `indexProduct(${product.id}) failed: ${(error as Error).message}`,
      );
    }
  }

  async onProductDeleted(productId: string): Promise<void> {
    try {
      await this.driver.removeProduct?.(productId);
    } catch (error) {
      this.logger.warn(
        `removeProduct(${productId}) failed: ${(error as Error).message}`,
      );
    }
  }

  async reindexAll(products: Product[]): Promise<void> {
    if (!this.driver.reindexAll) return;
    await this.driver.reindexAll(products);
  }
}
