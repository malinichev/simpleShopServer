import { Product } from '@/modules/products/entities/product.entity';

export interface SearchProductsInput {
  /** Поисковая фраза. Может содержать русский/латиницу/цифры. */
  term: string;
  /** Максимум результатов. */
  limit: number;
  filters?: {
    /** Если задано — фильтр только по этой категории (slug). */
    categorySlug?: string;
    /** Только активные товары в публичной выдаче (default true). */
    onlyActive?: boolean;
  };
}

export interface SearchProductsResult {
  items: Product[];
  /** Общее число matches (не обязательно — driver может не знать). */
  total?: number;
}

export type SearchDriverName = 'postgres' | 'meilisearch';

/**
 * Абстракция полнотекстового поиска. Реализации:
 *   - `PostgresSearchDriver`     — default. Использует Postgres ILIKE +
 *     ts_vector (если доступен). Нет внешних зависимостей.
 *   - `MeiliSearchDriver`        — stub. Требует `MEILISEARCH_HOST` env
 *     и доустановки пакета `meilisearch` шаблон-юзером.
 *
 * Регистрация условная (см. `search.module.ts`): driver выбирается по env
 * `SEARCH_DRIVER` (default `postgres`).
 *
 * Hooks `indexProduct`/`removeProduct`/`reindexAll` опциональны — для Postgres
 * это no-op (БД уже источник истины). MeiliSearch обязан их реализовать,
 * чтобы внешний индекс не расходился с БД.
 */
export interface SearchDriver {
  readonly name: SearchDriverName;

  searchProducts(input: SearchProductsInput): Promise<SearchProductsResult>;

  indexProduct?(product: Product): Promise<void>;
  removeProduct?(productId: string): Promise<void>;
  reindexAll?(products: Product[]): Promise<void>;
}

export const SEARCH_DRIVER = Symbol('SEARCH_DRIVER');
