import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { makeSlug } from './slug.utils';
import Redis from 'ioredis';
import { ProductsRepository } from './products.repository';
import { CategoriesService } from '@/modules/categories/categories.service';
import { SearchService } from '@/modules/search/search.service';
import {
  Product,
  ProductStatus,
  ProductImage,
} from './entities/product.entity';
import { ProductVariantEntity } from './entities/product-variant.entity';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  ProductFacetsDto,
} from './dto';
import { PaginatedResult } from '@/common/types/pagination.types';

const CACHE_PREFIX = 'products';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class ProductsService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesService: CategoriesService,
    private readonly configService: ConfigService,
    private readonly searchService: SearchService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password'),
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * По умолчанию includeHidden=true (внутренние потребители: импорт, корзина,
   * заказы, аналитика — работают и с черновиками). Публичный контроллер
   * каталога передаёт includeHidden только для админов из панели; без него
   * список принудительно фильтруется до status=active + isVisible=true.
   */
  async findAll(
    query: ProductQueryDto,
    opts: { includeHidden?: boolean } = {},
  ): Promise<PaginatedResult<Product>> {
    const includeHidden = opts.includeHidden ?? true;
    const effectiveQuery = includeHidden
      ? query
      : { ...query, status: ProductStatus.ACTIVE };
    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(effectiveQuery)}`;

    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as PaginatedResult<Product>;
    }

    const result = effectiveQuery.groupByModel
      ? await this.productsRepository.findAllGrouped(effectiveQuery)
      : await this.productsRepository.findAll(effectiveQuery, includeHidden);

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getFacets(query: ProductQueryDto): Promise<ProductFacetsDto> {
    const cacheKey = `${CACHE_PREFIX}:facets:${JSON.stringify(query)}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ProductFacetsDto;
    }

    const result = await this.productsRepository.getFacets(query);

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async search(term: string, limit: number = 10): Promise<Product[]> {
    const result = await this.searchService.searchProducts({ term, limit });
    return result.items;
  }

  /**
   * Публичный путь (includeHidden=false): не-активные/скрытые товары → 404,
   * кешируется только публично доступный товар. Админский путь обходит кеш,
   * чтобы черновик не попал в публичный кеш-ключ. Дефолт true — внутренние
   * потребители работают с черновиками как раньше.
   */
  async findBySlug(
    slug: string,
    opts: { includeHidden?: boolean } = {},
  ): Promise<Product> {
    const includeHidden = opts.includeHidden ?? true;
    const cacheKey = `${CACHE_PREFIX}:slug:${slug}`;

    if (!includeHidden) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Product;
      }
    }

    const product = await this.productsRepository.findBySlug(slug);
    if (
      !product ||
      (!includeHidden &&
        (product.status !== ProductStatus.ACTIVE || !product.isVisible))
    ) {
      throw new NotFoundException(`Товар со slug "${slug}" не найден`);
    }

    if (!includeHidden) {
      await this.redis.set(cacheKey, JSON.stringify(product), 'EX', CACHE_TTL);
    }
    return product;
  }

  async findById(
    id: string,
    opts: { includeHidden?: boolean } = {},
  ): Promise<Product> {
    const includeHidden = opts.includeHidden ?? true;
    const product = await this.productsRepository.findById(id);
    if (
      !product ||
      (!includeHidden &&
        (product.status !== ProductStatus.ACTIVE || !product.isVisible))
    ) {
      throw new NotFoundException('Товар не найден');
    }
    return product;
  }

  async findBySkus(skus: string[]): Promise<Product[]> {
    if (skus.length === 0) return [];
    return this.productsRepository.findBySkus(skus);
  }

  async findByNames(names: string[]): Promise<Product[]> {
    if (names.length === 0) return [];
    return this.productsRepository.findByNames(names);
  }

  async findRelated(id: string, limit: number = 8): Promise<Product[]> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    return this.productsRepository.findRelated(id, limit);
  }

  async create(dto: CreateProductDto): Promise<Product> {
    // Validate category exists
    await this.categoriesService.findById(dto.categoryId);

    // Generate slug
    const slug = dto.slug || this.generateSlug(dto.name);
    const existingBySlug = await this.productsRepository.findBySlug(slug);
    if (existingBySlug) {
      throw new ConflictException(`Товар со slug "${slug}" уже существует`);
    }

    // Generate SKU
    const sku = dto.sku || this.generateSku();
    const existingBySku = await this.productsRepository.findBySku(sku);
    if (existingBySku) {
      throw new ConflictException(`Товар с SKU "${sku}" уже существует`);
    }

    const productData: Partial<Product> = {
      name: dto.name,
      slug,
      description: dto.description,
      shortDescription: dto.shortDescription,
      sku,
      price: dto.price,
      compareAtPrice: dto.compareAtPrice,
      categoryId: dto.categoryId,
      tags: dto.tags || [],
      images: (dto.images || []) as ProductImage[],
      color: dto.color,
      colorHex: dto.colorHex,
      modelId: dto.modelId ?? null,
      gtin: dto.gtin ?? null,
      variants: (dto.variants || []).map((v) => ({
        size: v.size,
        sku: v.sku,
        stock: v.stock ?? 0,
        price: v.price,
        gtin: v.gtin ?? null,
      })) as ProductVariantEntity[],
      attributes: dto.attributes,
      rating: 0,
      reviewsCount: 0,
      soldCount: 0,
      status: dto.status || ProductStatus.DRAFT,
      seo: dto.seo,
      isVisible: dto.isVisible ?? true,
    };

    const product = await this.productsRepository.create(productData);
    await this.invalidateCache();
    await this.searchService.onProductSaved(product);
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(id);

    // Validate category if changed
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      await this.categoriesService.findById(dto.categoryId);
    }

    // Check slug uniqueness if changed
    if (dto.slug && dto.slug !== product.slug) {
      const existingBySlug = await this.productsRepository.findBySlug(dto.slug);
      if (existingBySlug && existingBySlug.id !== id) {
        throw new ConflictException(
          `Товар со slug "${dto.slug}" уже существует`,
        );
      }
    }

    // Check SKU uniqueness if changed
    if (dto.sku && dto.sku !== product.sku) {
      const existingBySku = await this.productsRepository.findBySku(dto.sku);
      if (existingBySku && existingBySku.id !== id) {
        throw new ConflictException(`Товар с SKU "${dto.sku}" уже существует`);
      }
    }

    // Separate variants from other fields (variants are a relation, not a column)
    const { variants: variantsDto, ...restDto } = dto;

    const updateData: Partial<Product> = {};

    if (restDto.name !== undefined) updateData.name = restDto.name;
    if (restDto.slug !== undefined) updateData.slug = restDto.slug;
    if (restDto.description !== undefined)
      updateData.description = restDto.description;
    if (restDto.shortDescription !== undefined)
      updateData.shortDescription = restDto.shortDescription;
    if (restDto.sku !== undefined) updateData.sku = restDto.sku;
    if (restDto.price !== undefined) updateData.price = restDto.price;
    if (restDto.compareAtPrice !== undefined)
      updateData.compareAtPrice = restDto.compareAtPrice;
    if (restDto.categoryId !== undefined)
      updateData.categoryId = restDto.categoryId;
    if (restDto.tags !== undefined) updateData.tags = restDto.tags;
    if (restDto.images !== undefined)
      updateData.images = restDto.images as ProductImage[];
    if (restDto.attributes !== undefined)
      updateData.attributes = restDto.attributes;
    if (restDto.status !== undefined) updateData.status = restDto.status;
    if (restDto.seo !== undefined) updateData.seo = restDto.seo;
    if (restDto.isVisible !== undefined)
      updateData.isVisible = restDto.isVisible;
    if ((restDto as any).color !== undefined)
      (updateData as any).color = (restDto as any).color;
    if ((restDto as any).colorHex !== undefined)
      (updateData as any).colorHex = (restDto as any).colorHex;
    if ((restDto as any).modelId !== undefined)
      (updateData as any).modelId = (restDto as any).modelId;
    if ((restDto as any).gtin !== undefined)
      (updateData as any).gtin = (restDto as any).gtin || null;

    const updated = await this.productsRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException('Товар не найден');
    }

    // Handle variants separately (replace all)
    if (variantsDto !== undefined) {
      await this.productsRepository.replaceVariants(
        id,
        variantsDto.map((v) => ({
          size: v.size,
          sku: v.sku,
          stock: v.stock ?? 0,
          price: v.price,
          gtin: v.gtin ?? null,
        })),
      );
    }

    await this.invalidateCache();
    const fresh = await this.findById(id);
    await this.searchService.onProductSaved(fresh);
    return fresh;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.productsRepository.delete(id);
    await this.invalidateCache();
    await this.searchService.onProductDeleted(id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.productsRepository.bulkDelete(ids);
    await this.invalidateCache();
  }

  async bulkUpdateStatus(ids: string[], status: ProductStatus): Promise<void> {
    await this.productsRepository.bulkUpdateStatus(ids, status);
    await this.invalidateCache();
  }

  async updateStock(
    id: string,
    variantId: string,
    stock: number,
  ): Promise<Product> {
    const product = await this.findById(id);

    const variantExists = product.variants.some((v) => v.id === variantId);
    if (!variantExists) {
      throw new BadRequestException(`Вариант с id "${variantId}" не найден`);
    }

    await this.productsRepository.updateVariantStock(variantId, stock);
    await this.invalidateCache();
    return this.findById(id);
  }

  async incrementSoldCount(id: string, quantity: number): Promise<void> {
    await this.productsRepository.incrementSoldCount(id, quantity);
    await this.invalidateCache();
  }

  async updateRating(id: string, rating: number, count: number): Promise<void> {
    await this.productsRepository.updateRating(id, rating, count);
    await this.invalidateCache();
  }

  toResponseDto(
    product: Product,
    category?: { id: string; name: string; slug: string },
  ): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      sku: product.sku,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      categoryId: product.categoryId,
      category: category
        ? {
            id: category.id,
            name: category.name,
            slug: category.slug,
          }
        : undefined,
      tags: product.tags || [],
      images: product.images || [],
      variants: product.variants || [],
      attributes: product.attributes,
      rating: product.rating,
      reviewsCount: product.reviewsCount,
      soldCount: product.soldCount,
      status: product.status,
      seo: product.seo,
      isVisible: product.isVisible,
      color: product.color,
      colorHex: product.colorHex,
      modelId: product.modelId,
      gtin: product.gtin,
      requiresMarking: product.requiresMarking,
      colorSiblings: (product as any).colorSiblings,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async findColorSiblings(productId: string) {
    const product = await this.findById(productId);
    if (!product.modelId) return [];
    const siblings = await this.productsRepository.findColorSiblings(
      product.modelId,
      productId,
    );
    return siblings.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      color: s.color,
      colorHex: s.colorHex,
      // Превью = фото с минимальным order (баг: images[0] мог быть любым)
      image: [...(s.images ?? [])].sort((a, b) => a.order - b.order)[0]?.url,
    }));
  }

  /**
   * Дублировать товар как новый цвет (юзер 2026-11-04):
   * копируем базовые поля, очищаем цвет/фото/SEO/gtin/метрики,
   * наследуем modelId (или генерируем если нет), варианты — те же размеры
   * с новым SKU и stock=0.
   */
  async duplicateAsColor(productId: string): Promise<Product> {
    const source = await this.productsRepository.findById(productId);
    if (!source) throw new NotFoundException('Товар не найден');

    // modelId: наследуем или генерируем обоим
    let modelId = source.modelId;
    if (!modelId) {
      modelId = uuidv4();
      await this.productsRepository.update(source.id, { modelId });
    }

    const newSlug = this.generateSlug(source.name);
    const newSku = this.generateSku();

    const copyData: Partial<Product> = {
      name: source.name,
      slug: newSlug,
      sku: newSku,
      description: source.description,
      shortDescription: source.shortDescription,
      categoryId: source.categoryId,
      tags: source.tags ? [...source.tags] : undefined,
      attributes: source.attributes ? { ...source.attributes } : undefined,
      price: source.price,
      compareAtPrice: source.compareAtPrice,
      status: ProductStatus.DRAFT,
      isVisible: true,
      // Очищаем — админ заполнит для нового цвета
      color: undefined,
      colorHex: undefined,
      images: [],
      seo: { title: '', description: '', keywords: [] },
      gtin: undefined,
      soldCount: 0,
      rating: undefined,
      reviewsCount: 0,
      modelId,
      // Варианты: те же размеры, новый SKU, stock=0, gtin очищен
      variants: (source.variants ?? []).map((v) => ({
        size: v.size,
        sku: this.generateSku(),
        stock: 0,
        price: v.price,
        gtin: null,
      })) as any,
    };

    const created = await this.productsRepository.create(copyData);
    await this.invalidateCache();
    this.searchService.onProductSaved(created);
    return created;
  }

  /**
   * Список моделей (связок цветов) для пикера в админке:
   * группы по modelId, представитель = первый, члены — все товары группы.
   */
  async findModels(search?: string): Promise<
    Array<{
      modelId: string;
      name: string;
      products: Array<{
        id: string;
        name: string;
        color?: string;
        colorHex?: string;
        image?: string;
        status: string;
      }>;
    }>
  > {
    const all = await this.productsRepository.findAll({
      limit: 500,
      page: 1,
    });
    const withModel = all.data.filter(
      (p) => p.modelId && (!search || p.name.toLowerCase().includes(search.toLowerCase())),
    );

    const groups = new Map<string, typeof withModel>();
    for (const p of withModel) {
      const list = groups.get(p.modelId!) ?? [];
      list.push(p);
      groups.set(p.modelId!, list);
    }

    return [...groups.entries()].map(([modelId, products]) => ({
      modelId,
      name: products[0].name,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color ?? undefined,
        colorHex: p.colorHex ?? undefined,
        image: [...(p.images ?? [])].sort((a, b) => a.order - b.order)[0]?.url,
        status: p.status,
      })),
    }));
  }

  private generateSlug(name: string): string {
    // транслитерация RU→lat: slugify кириллицу выкидывает («Комбинезон» → '')
    const base = makeSlug(name);
    const suffix = uuidv4().slice(0, 6);
    return `${base}-${suffix}`;
  }

  private generateSku(): string {
    const prefix = 'PRD';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = uuidv4().slice(0, 4).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  async count(): Promise<number> {
    return this.productsRepository.count();
  }

  /** Публичный для батч-операций (stock-sync): они апдейтят варианты напрямую и флешат кэш один раз. */
  async invalidateCache(): Promise<void> {
    const keys = await this.redis.keys(`${CACHE_PREFIX}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
