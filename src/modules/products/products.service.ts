import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { ProductsRepository } from './products.repository';
import { CategoriesService } from '@/modules/categories/categories.service';
import {
  Product,
  ProductStatus,
  ProductImage,
  ProductVariant,
} from './entities/product.entity';
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
      return JSON.parse(cached);
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
      return JSON.parse(cached);
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
      categoryId: new ObjectId(dto.categoryId),
      tags: dto.tags || [],
      images: (dto.images || []) as ProductImage[],
      variants: (dto.variants || []) as ProductVariant[],
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
    if (dto.categoryId && dto.categoryId !== product.categoryId.toString()) {
      await this.categoriesService.findById(dto.categoryId);
    }

    // Check slug uniqueness if changed
    if (dto.slug && dto.slug !== product.slug) {
      const existingBySlug = await this.productsRepository.findBySlug(dto.slug);
      if (existingBySlug && existingBySlug._id.toString() !== id) {
        throw new ConflictException(`Товар со slug "${dto.slug}" уже существует`);
      }
    }

    // Check SKU uniqueness if changed
    if (dto.sku && dto.sku !== product.sku) {
      const existingBySku = await this.productsRepository.findBySku(dto.sku);
      if (existingBySku && existingBySku._id.toString() !== id) {
        throw new ConflictException(`Товар с SKU "${dto.sku}" уже существует`);
      }
    }

    const updateData: Partial<Product> = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.shortDescription !== undefined) updateData.shortDescription = dto.shortDescription;
    if (dto.sku !== undefined) updateData.sku = dto.sku;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.compareAtPrice !== undefined) updateData.compareAtPrice = dto.compareAtPrice;
    if (dto.categoryId !== undefined) updateData.categoryId = new ObjectId(dto.categoryId);
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.images !== undefined) updateData.images = dto.images as ProductImage[];
    if (dto.variants !== undefined) updateData.variants = dto.variants as ProductVariant[];
    if (dto.attributes !== undefined) updateData.attributes = dto.attributes;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.seo !== undefined) updateData.seo = dto.seo;
    if (dto.isVisible !== undefined) updateData.isVisible = dto.isVisible;

    const updated = await this.productsRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException('Товар не найден');
    }

    await this.invalidateCache();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.productsRepository.delete(id);
    await this.invalidateCache();
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const objectIds = ids.map((id) => new ObjectId(id));
    await this.productsRepository.bulkDelete(objectIds);
    await this.invalidateCache();
  }

  async bulkUpdateStatus(ids: string[], status: ProductStatus): Promise<void> {
    const objectIds = ids.map((id) => new ObjectId(id));
    await this.productsRepository.bulkUpdateStatus(objectIds, status);
    await this.invalidateCache();
  }

  async updateStock(id: string, variantId: string, stock: number): Promise<Product> {
    const product = await this.findById(id);

    const variantExists = product.variants.some((v) => v.id === variantId);
    if (!variantExists) {
      throw new BadRequestException(`Вариант с id "${variantId}" не найден`);
    }

    await this.productsRepository.updateStock(id, variantId, stock);
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

  toResponseDto(product: Product, category?: { _id: ObjectId; name: string; slug: string }): ProductResponseDto {
    return {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      sku: product.sku,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      categoryId: product.categoryId.toString(),
      category: category
        ? { _id: category._id.toString(), name: category.name, slug: category.slug }
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
