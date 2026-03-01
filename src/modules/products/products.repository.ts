import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, ILike, FindOptionsWhere, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Product, ProductStatus } from './entities/product.entity';
import { ProductVariantEntity } from './entities/product-variant.entity';
import { ProductQueryDto, SortOption } from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';

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

    const qb = this.repository.createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variant');

    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }

    if (query.category) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: query.category });
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
      qb.andWhere('variant.color IN (:...colors)', { colors: query.colors });
    }

    if (query.activity?.length) {
      qb.andWhere("product.attributes->'activity' ?| ARRAY[:...activity]", { activity: query.activity });
    }

    if (query.inStock === true) {
      qb.andWhere('variant.stock > 0');
    }

    const order = this.buildSortOrder(query.sort);
    const [sortField, sortDir] = Object.entries(order)[0];
    qb.orderBy(`product.${sortField}`, sortDir);

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async search(term: string, limit: number): Promise<Product[]> {
    return this.repository.find({
      where: [
        { name: ILike(`%${term}%`), status: ProductStatus.ACTIVE, isVisible: true },
        { description: ILike(`%${term}%`), status: ProductStatus.ACTIVE, isVisible: true },
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

  async create(data: Partial<Product>): Promise<Product> {
    const product = this.repository.create(data);
    return this.repository.save(product);
  }

  async update(id: string, data: Partial<Product>): Promise<Product | null> {
    await this.repository.update(id, data as any);
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
