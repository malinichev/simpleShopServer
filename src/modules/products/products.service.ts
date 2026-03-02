import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { ProductsRepository } from './products.repository';
import { CategoriesService } from '@/modules/categories/categories.service';
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

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify(query)}`;

    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as PaginatedResult<Product>;
    }

    const result = await this.productsRepository.findAll(query);

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async search(term: string, limit: number = 10): Promise<Product[]> {
    if (!term || term.trim().length < 2) {
      return [];
    }
    return this.productsRepository.search(term.trim(), limit);
  }

  async findBySlug(slug: string): Promise<Product> {
    const cacheKey = `${CACHE_PREFIX}:slug:${slug}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Product;
    }

    const product = await this.productsRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundException(`Товар со slug "${slug}" не найден`);
    }

    await this.redis.set(cacheKey, JSON.stringify(product), 'EX', CACHE_TTL);
    return product;
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    return product;
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
      variants: (dto.variants || []).map((v) => ({
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        sku: v.sku,
        stock: v.stock ?? 0,
        price: v.price,
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
          color: v.color,
          colorHex: v.colorHex,
          sku: v.sku,
          stock: v.stock ?? 0,
          price: v.price,
        })),
      );
    }

    await this.invalidateCache();
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.productsRepository.delete(id);
    await this.invalidateCache();
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
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private generateSlug(name: string): string {
    const base = slugify(name, { lower: true, strict: true });
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

  private async invalidateCache(): Promise<void> {
    const keys = await this.redis.keys(`${CACHE_PREFIX}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
