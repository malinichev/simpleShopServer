import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from '@/modules/products/entities/product.entity';
import {
  SearchDriver,
  SearchProductsInput,
  SearchProductsResult,
} from './search-driver.interface';

/**
 * MeiliSearch driver — STUB.
 *
 * Активируется при `SEARCH_DRIVER=meilisearch` и `MEILISEARCH_HOST`.
 * На момент v1.0 шаблона — заготовка интерфейса; реальная интеграция
 * дописывается шаблон-юзером.
 *
 * # Как доинтегрировать (для шаблон-юзера)
 *
 * 1. `pnpm add meilisearch`.
 * 2. Поднять MeiliSearch (Docker: `docker run -p 7700:7700 getmeili/meilisearch`).
 * 3. В конструкторе:
 *    ```ts
 *    this.client = new MeiliSearch({
 *      host: configService.get('search.meilisearch.host'),
 *      apiKey: configService.get('search.meilisearch.apiKey'),
 *    });
 *    this.index = this.client.index('products');
 *    ```
 * 4. В `searchProducts()`:
 *    ```ts
 *    const res = await this.index.search(term, { limit, filter: '...' });
 *    return { items: res.hits as Product[], total: res.estimatedTotalHits };
 *    ```
 * 5. Hooks `indexProduct`/`removeProduct` — обязательно реализовать,
 *    иначе внешний индекс разойдётся с БД. Вызываются из ProductsService
 *    после save/delete (см. `search.service.ts`).
 * 6. `reindexAll` — нужен для setup-wizard'а («переинициализировать индекс
 *    после смены preset'а»). Прогоняй батчами по 1000 документов.
 *
 * @see https://www.meilisearch.com/docs/reference/api/overview
 */
@Injectable()
export class MeiliSearchDriver implements SearchDriver {
  private readonly logger = new Logger(MeiliSearchDriver.name);
  readonly name = 'meilisearch' as const;

  constructor(private readonly _configService: ConfigService) {}

  async searchProducts(
    _input: SearchProductsInput,
  ): Promise<SearchProductsResult> {
    this.logger.warn(
      'MeiliSearch.searchProducts() called but driver is a stub — fallback на пустой результат',
    );
    throw new NotImplementedException(
      'MeiliSearch driver is a stub. См. server/src/modules/search/drivers/meilisearch.driver.ts',
    );
  }

  async indexProduct(_product: Product): Promise<void> {
    this.logger.warn(
      'MeiliSearch.indexProduct() called but driver is a stub — индекс не обновлён',
    );
  }

  async removeProduct(_productId: string): Promise<void> {
    this.logger.warn(
      'MeiliSearch.removeProduct() called but driver is a stub — индекс не обновлён',
    );
  }

  async reindexAll(_products: Product[]): Promise<void> {
    this.logger.warn(
      'MeiliSearch.reindexAll() called but driver is a stub — индекс не пересобран',
    );
  }
}
