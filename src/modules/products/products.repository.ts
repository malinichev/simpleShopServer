import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, ILike, In } from 'typeorm';
import { Product, ProductStatus } from './entities/product.entity';
import { ProductVariantEntity } from './entities/product-variant.entity';
import {
  ProductQueryDto,
  SortOption,
  ProductFacetsDto,
  FacetItemDto,
} from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';

const ACTIVITY_LABELS: Record<string, string> = {
  yoga: 'Йога',
  running: 'Бег',
  gym: 'Тренажёрный зал',
  casual: 'Повседневный',
  pilates: 'Пилатес',
  fitness: 'Фитнес',
  dance: 'Танцы',
  swimming: 'Плавание',
};

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>,
    @InjectRepository(ProductVariantEntity)
    private readonly variantRepository: Repository<ProductVariantEntity>,
  ) {}

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const qb = this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variant');

    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }

    if (query.category) {
      qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.category,
      });
    }

    if (query.search) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search OR product.shortDescription ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    if (query.sizes?.length) {
      qb.andWhere('variant.size IN (:...sizes)', { sizes: query.sizes });
    }

    if (query.colors?.length) {
      qb.andWhere('LOWER(product.color) IN (:...colors)', {
        colors: query.colors,
      });
    }

    if (query.activity?.length) {
      qb.andWhere("product.attributes->'activity' ?| ARRAY[:...activity]", {
        activity: query.activity,
      });
    }

    if (query.inStock === true) {
      qb.andWhere('variant.stock > 0');
    }

    const order = this.buildSortOrder(query.sort);
    const [sortField, sortDir] = Object.entries(order)[0];
    qb.orderBy(`product.${sortField}`, sortDir);

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    await this.attachColorSiblings(data);

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async search(term: string, limit: number): Promise<Product[]> {
    return this.repository.find({
      where: [
        {
          name: ILike(`%${term}%`),
          status: ProductStatus.ACTIVE,
          isVisible: true,
        },
        {
          description: ILike(`%${term}%`),
          status: ProductStatus.ACTIVE,
          isVisible: true,
        },
      ],
      relations: ['variants'],
      take: limit,
      order: { soldCount: 'DESC' },
    });
  }

  async findBySlug(slug: string): Promise<Product | null> {
    return this.repository.findOne({
      where: { slug },
      relations: ['variants'],
    });
  }

  async findById(id: string): Promise<Product | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['variants'],
    });
  }

  async findBySku(sku: string): Promise<Product | null> {
    return this.repository.findOne({
      where: { sku },
      relations: ['variants'],
    });
  }

  async findBySkus(skus: string[]): Promise<Product[]> {
    if (skus.length === 0) return [];
    return this.repository.find({
      where: { sku: In(skus) },
      relations: ['variants'],
    });
  }

  async findByNames(names: string[]): Promise<Product[]> {
    if (names.length === 0) return [];
    return this.repository.find({
      where: { name: In(names) },
      relations: ['variants'],
    });
  }

  async create(data: Partial<Product>): Promise<Product> {
    const product = this.repository.create(data);
    return this.repository.save(product);
  }

  async update(id: string, data: Partial<Product>): Promise<Product | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.repository.delete(ids);
  }

  async bulkUpdateStatus(ids: string[], status: ProductStatus): Promise<void> {
    await this.repository.update(ids, { status });
  }

  async updateVariantStock(variantId: string, stock: number): Promise<void> {
    await this.variantRepository.update(variantId, { stock });
  }

  async replaceVariants(
    productId: string,
    variants: Partial<ProductVariantEntity>[],
  ): Promise<void> {
    await this.variantRepository.delete({ productId });
    if (variants.length > 0) {
      const entities = variants.map((v) =>
        this.variantRepository.create({ ...v, productId }),
      );
      await this.variantRepository.save(entities);
    }
  }

  async findVariantById(
    variantId: string,
  ): Promise<ProductVariantEntity | null> {
    return this.variantRepository.findOne({ where: { id: variantId } });
  }

  async findColorSiblings(
    modelId: string,
    excludeProductId: string,
  ): Promise<Product[]> {
    return this.repository.find({
      where: {
        modelId,
        id: Not(excludeProductId),
        status: ProductStatus.ACTIVE,
        isVisible: true,
      },
      select: ['id', 'slug', 'name', 'color', 'colorHex', 'images'],
    });
  }

  async findRelated(productId: string, limit: number): Promise<Product[]> {
    const product = await this.findById(productId);
    if (!product) return [];

    return this.repository.find({
      where: {
        id: Not(productId),
        categoryId: product.categoryId,
        status: ProductStatus.ACTIVE,
        isVisible: true,
      },
      relations: ['variants'],
      take: limit,
      order: { soldCount: 'DESC' },
    });
  }

  async incrementSoldCount(id: string, quantity: number): Promise<void> {
    await this.repository.increment({ id }, 'soldCount', quantity);
  }

  async updateRating(id: string, rating: number, count: number): Promise<void> {
    await this.repository.update(id, { rating, reviewsCount: count });
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async countByStatus(): Promise<Record<string, number>> {
    const products = await this.repository.find({ select: ['status'] });
    return products.reduce(
      (acc, product) => {
        acc[product.status] = (acc[product.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async findAllGrouped(
    query: ProductQueryDto,
  ): Promise<PaginatedResult<Product>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    // Build raw SQL filters with continuous parameter indexing
    const allParams: any[] = [];
    let paramIdx = 1;

    // qualifying_groups: all filters including variant-level
    const qgFilters = this.buildRawFilters(query, true, paramIdx);
    allParams.push(...qgFilters.params);
    paramIdx = qgFilters.nextIdx;

    // candidates: product-level filters only (no variant joins needed)
    const candFilters = this.buildRawFilters(query, false, paramIdx);
    allParams.push(...candFilters.params);
    paramIdx = candFilters.nextIdx;

    // Color preference in ranking ORDER BY
    let colorOrderCase = '';
    if (query.colors?.length) {
      const placeholders = query.colors.map((_, i) => `$${paramIdx + i}`);
      colorOrderCase = `CASE WHEN LOWER(c.color) IN (${placeholders.join(', ')}) THEN 0 ELSE 1 END,`;
      allParams.push(...query.colors);
      paramIdx += query.colors.length;
    }

    const cteQuery = `
      WITH qualifying_groups AS (
        SELECT DISTINCT COALESCE(p."modelId"::text, p.id::text) AS group_key
        FROM products p
        LEFT JOIN product_variants v ON v."productId" = p.id
        WHERE ${qgFilters.clauses.join(' AND ')}
      ),
      candidates AS (
        SELECT p.id, COALESCE(p."modelId"::text, p.id::text) AS group_key,
               p."soldCount", p.color
        FROM products p
        WHERE ${candFilters.clauses.join(' AND ')}
          AND COALESCE(p."modelId"::text, p.id::text) IN (SELECT group_key FROM qualifying_groups)
      ),
      ranked AS (
        SELECT id, group_key,
          ROW_NUMBER() OVER (
            PARTITION BY group_key
            ORDER BY ${colorOrderCase} "soldCount" DESC
          ) AS rn
        FROM candidates c
      )
      SELECT id FROM ranked WHERE rn = 1
    `;

    const repRows: Array<{ id: string }> = await this.repository.query(
      cteQuery,
      allParams,
    );
    const repIds = repRows.map((r) => r.id);
    const total = repIds.length;

    if (total === 0) {
      return { data: [], meta: createPaginationMeta(page, limit, 0) };
    }

    // Load paginated results via TypeORM
    const order = this.buildSortOrder(query.sort);
    const [sortField, sortDir] = Object.entries(order)[0];

    // Get paginated IDs respecting sort
    const sortedQb = this.repository
      .createQueryBuilder('product')
      .select('product.id')
      .where('product.id IN (:...repIds)', { repIds })
      .orderBy(`product.${sortField}`, sortDir)
      .skip(skip)
      .take(limit);

    const pageIds = (await sortedQb.getRawMany()).map((r: any) => r.product_id);

    if (pageIds.length === 0) {
      return { data: [], meta: createPaginationMeta(page, limit, total) };
    }

    // Load full products with variants
    const qb = this.repository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variant')
      .where('product.id IN (:...pageIds)', { pageIds })
      .orderBy(`product.${sortField}`, sortDir);

    const data = await qb.getMany();

    await this.attachColorSiblings(data);

    return { data, meta: createPaginationMeta(page, limit, total) };
  }

  async getFacets(query: ProductQueryDto): Promise<ProductFacetsDto> {
    const [colors, sizes, activities, priceRange] = await Promise.all([
      this.getColorFacet(query),
      this.getSizeFacet(query),
      this.getActivityFacet(query),
      this.getPriceRange(query),
    ]);

    return { colors, sizes, activities, priceRange };
  }

  private async getColorFacet(query: ProductQueryDto): Promise<FacetItemDto[]> {
    const { clauses, params } = this.buildRawFilters(query, true, 1, 'colors');
    const sql = `
      SELECT
        LOWER(p.color) AS value,
        MIN(p.color)   AS label,
        MIN(p."colorHex") AS hex,
        COUNT(DISTINCT COALESCE(p."modelId"::text, p.id::text))::int AS count
      FROM products p
      LEFT JOIN product_variants v ON v."productId" = p.id
      WHERE ${clauses.join(' AND ')}
        AND p.color IS NOT NULL
        AND p.color <> ''
      GROUP BY LOWER(p.color)
      ORDER BY count DESC, value ASC
    `;
    const rows: Array<{
      value: string;
      label: string;
      hex: string | null;
      count: number;
    }> = await this.repository.query(sql, params);
    return rows.map((r) => ({
      value: r.value,
      label: this.capitalize(r.label ?? r.value),
      hex: r.hex ?? undefined,
      count: Number(r.count),
    }));
  }

  private async getSizeFacet(query: ProductQueryDto): Promise<FacetItemDto[]> {
    const { clauses, params } = this.buildRawFilters(query, true, 1, 'sizes');
    const sql = `
      SELECT
        v.size AS value,
        COUNT(DISTINCT COALESCE(p."modelId"::text, p.id::text))::int AS count
      FROM products p
      JOIN product_variants v ON v."productId" = p.id
      WHERE ${clauses.join(' AND ')}
        AND v.size IS NOT NULL
        AND v.size <> ''
      GROUP BY v.size
      ORDER BY count DESC, value ASC
    `;
    const rows: Array<{ value: string; count: number }> =
      await this.repository.query(sql, params);
    return rows.map((r) => ({
      value: r.value,
      label: r.value,
      count: Number(r.count),
    }));
  }

  private async getActivityFacet(
    query: ProductQueryDto,
  ): Promise<FacetItemDto[]> {
    const { clauses, params } = this.buildRawFilters(
      query,
      true,
      1,
      'activity',
    );
    const sql = `
      SELECT
        act AS value,
        COUNT(DISTINCT COALESCE(p."modelId"::text, p.id::text))::int AS count
      FROM products p
      LEFT JOIN product_variants v ON v."productId" = p.id
      CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(p.attributes->'activity', '[]'::jsonb)
      ) AS act
      WHERE ${clauses.join(' AND ')}
      GROUP BY act
      ORDER BY count DESC, value ASC
    `;
    const rows: Array<{ value: string; count: number }> =
      await this.repository.query(sql, params);
    return rows.map((r) => ({
      value: r.value,
      label: ACTIVITY_LABELS[r.value] ?? this.capitalize(r.value),
      count: Number(r.count),
    }));
  }

  private async getPriceRange(
    query: ProductQueryDto,
  ): Promise<{ min: number; max: number }> {
    const { clauses, params } = this.buildRawFilters(query, true, 1, 'price');
    const sql = `
      SELECT
        COALESCE(MIN(p.price), 0)::float AS min,
        COALESCE(MAX(p.price), 0)::float AS max
      FROM products p
      LEFT JOIN product_variants v ON v."productId" = p.id
      WHERE ${clauses.join(' AND ')}
    `;
    const rows: Array<{ min: number; max: number }> =
      await this.repository.query(sql, params);
    const row = rows[0] ?? { min: 0, max: 0 };
    return { min: Number(row.min), max: Number(row.max) };
  }

  private capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private buildRawFilters(
    query: ProductQueryDto,
    includeVariantFilters: boolean,
    startIdx: number,
    excludeField: 'colors' | 'sizes' | 'activity' | 'price' | null = null,
  ): { clauses: string[]; params: any[]; nextIdx: number } {
    const clauses: string[] = [];
    const params: any[] = [];
    let paramIdx = startIdx;

    clauses.push(`p.status = 'active'`);
    clauses.push(`p."isVisible" = true`);

    if (query.category) {
      clauses.push(`p."categoryId" = $${paramIdx}`);
      params.push(query.category);
      paramIdx++;
    }

    if (query.search) {
      clauses.push(
        `(p.name ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx} OR p."shortDescription" ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx})`,
      );
      params.push(`%${query.search}%`);
      paramIdx++;
    }

    if (excludeField !== 'price' && query.minPrice !== undefined) {
      clauses.push(`p.price >= $${paramIdx}`);
      params.push(query.minPrice);
      paramIdx++;
    }

    if (excludeField !== 'price' && query.maxPrice !== undefined) {
      clauses.push(`p.price <= $${paramIdx}`);
      params.push(query.maxPrice);
      paramIdx++;
    }

    if (excludeField !== 'colors' && query.colors?.length) {
      const placeholders = query.colors.map((_, i) => `$${paramIdx + i}`);
      clauses.push(`LOWER(p.color) IN (${placeholders.join(', ')})`);
      params.push(...query.colors);
      paramIdx += query.colors.length;
    }

    if (excludeField !== 'activity' && query.activity?.length) {
      const placeholders = query.activity.map((_, i) => `$${paramIdx + i}`);
      clauses.push(
        `p.attributes->'activity' ?| ARRAY[${placeholders.join(', ')}]`,
      );
      params.push(...query.activity);
      paramIdx += query.activity.length;
    }

    if (includeVariantFilters) {
      if (excludeField !== 'sizes' && query.sizes?.length) {
        const placeholders = query.sizes.map((_, i) => `$${paramIdx + i}`);
        clauses.push(`v.size IN (${placeholders.join(', ')})`);
        params.push(...query.sizes);
        paramIdx += query.sizes.length;
      }

      if (query.inStock === true) {
        clauses.push(`v.stock > 0`);
      }
    }

    return { clauses, params, nextIdx: paramIdx };
  }

  private async attachColorSiblings(data: Product[]): Promise<void> {
    const modelIds = [
      ...new Set(data.filter((p) => p.modelId).map((p) => p.modelId!)),
    ];
    if (modelIds.length === 0) return;

    const siblings = await this.repository.find({
      where: {
        modelId: In(modelIds),
        status: ProductStatus.ACTIVE,
        isVisible: true,
      },
      select: ['id', 'slug', 'name', 'color', 'colorHex', 'images', 'modelId'],
    });

    const siblingsByModel = new Map<string, typeof siblings>();
    for (const s of siblings) {
      const list = siblingsByModel.get(s.modelId!) ?? [];
      list.push(s);
      siblingsByModel.set(s.modelId!, list);
    }

    for (const product of data) {
      if (product.modelId) {
        const allSiblings = siblingsByModel.get(product.modelId) ?? [];
        (product as any).colorSiblings = allSiblings
          .filter((s) => s.id !== product.id)
          .map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            color: s.color,
            colorHex: s.colorHex,
            image: s.images?.[0]?.url,
          }));
      }
    }
  }

  private buildSortOrder(sort?: SortOption): Record<string, 'ASC' | 'DESC'> {
    switch (sort) {
      case SortOption.PRICE_ASC:
        return { price: 'ASC' };
      case SortOption.PRICE_DESC:
        return { price: 'DESC' };
      case SortOption.NEWEST:
        return { createdAt: 'DESC' };
      case SortOption.POPULAR:
        return { soldCount: 'DESC' };
      case SortOption.RATING:
        return { rating: 'DESC' };
      default:
        return { createdAt: 'DESC' };
    }
  }
}
