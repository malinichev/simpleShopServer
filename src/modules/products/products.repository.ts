import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Product, ProductStatus } from './entities/product.entity';
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
  ) {}

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<Product>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.category && ObjectId.isValid(query.category)) {
      where.categoryId = new ObjectId(query.category);
    }

    if (query.search) {
      where.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
        { shortDescription: { $regex: query.search, $options: 'i' } },
        { sku: { $regex: query.search, $options: 'i' } },
      ];
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (query.minPrice !== undefined) priceFilter.$gte = query.minPrice;
      if (query.maxPrice !== undefined) priceFilter.$lte = query.maxPrice;
      where.price = priceFilter;
    }

    if (query.sizes?.length) {
      where['variants.size'] = { $in: query.sizes };
    }

    if (query.colors?.length) {
      where['variants.color'] = { $in: query.colors };
    }

    if (query.activity?.length) {
      where['attributes.activity'] = { $in: query.activity };
    }

    if (query.inStock === true) {
      where['variants.stock'] = { $gt: 0 };
    }

    const order = this.buildSortOrder(query.sort);

    const [data, total] = await this.repository.findAndCount({
      where,
      skip,
      take: limit,
      order,
    });

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async search(term: string, limit: number): Promise<Product[]> {
    return this.repository.find({
      where: {
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } },
        ],
        status: ProductStatus.ACTIVE,
        isVisible: true,
      } as Record<string, unknown>,
      take: limit,
      order: { soldCount: 'DESC' },
    });
  }

  async findBySlug(slug: string): Promise<Product | null> {
    return this.repository.findOne({
      where: { slug } as Record<string, unknown>,
    });
  }

  async findById(id: ObjectId | string): Promise<Product | null> {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.repository.findOne({
        where: { _id: objectId } as Record<string, unknown>,
      });
    } catch {
      return null;
    }
  }

  async findBySku(sku: string): Promise<Product | null> {
    return this.repository.findOne({
      where: { sku } as Record<string, unknown>,
    });
  }

  async create(data: Partial<Product>): Promise<Product> {
    const product = this.repository.create(data);
    return this.repository.save(product);
  }

  async update(
    id: ObjectId | string,
    data: Partial<Product>,
  ): Promise<Product | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as Record<string, unknown>,
      data as Record<string, unknown>,
    );
    return this.findById(objectId);
  }

  async delete(id: ObjectId | string): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.delete({ _id: objectId } as Record<string, unknown>);
  }

  async bulkDelete(ids: ObjectId[]): Promise<void> {
    const deletePromises = ids.map((id) =>
      this.repository.delete({ _id: id } as Record<string, unknown>),
    );
    await Promise.all(deletePromises);
  }

  async bulkUpdateStatus(
    ids: ObjectId[],
    status: ProductStatus,
  ): Promise<void> {
    const updatePromises = ids.map((id) =>
      this.repository.update({ _id: id } as Record<string, unknown>, {
        status,
      }),
    );
    await Promise.all(updatePromises);
  }

  async updateStock(
    id: ObjectId | string,
    variantId: string,
    stock: number,
  ): Promise<void> {
    const product = await this.findById(id);
    if (!product) return;

    const variants = product.variants.map((v) =>
      v.id === variantId ? { ...v, stock } : v,
    );

    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update({ _id: objectId } as Record<string, unknown>, {
      variants,
    });
  }

  async findRelated(
    productId: ObjectId | string,
    limit: number,
  ): Promise<Product[]> {
    const product = await this.findById(productId);
    if (!product) return [];

    const objectId =
      typeof productId === 'string' ? new ObjectId(productId) : productId;

    return this.repository.find({
      where: {
        _id: { $ne: objectId },
        categoryId: product.categoryId,
        status: ProductStatus.ACTIVE,
        isVisible: true,
      } as Record<string, unknown>,
      take: limit,
      order: { soldCount: 'DESC' },
    });
  }

  async incrementSoldCount(
    id: ObjectId | string,
    quantity: number,
  ): Promise<void> {
    const product = await this.findById(id);
    if (!product) return;

    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update({ _id: objectId } as Record<string, unknown>, {
      soldCount: product.soldCount + quantity,
    });
  }

  async updateRating(
    id: ObjectId | string,
    rating: number,
    count: number,
  ): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update({ _id: objectId } as Record<string, unknown>, {
      rating,
      reviewsCount: count,
    });
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
