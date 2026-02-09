import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Review } from './entities/review.entity';
import { ReviewQueryDto } from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';

@Injectable()
export class ReviewsRepository {
  constructor(
    @InjectRepository(Review)
    private readonly repository: Repository<Review>,
  ) {}

  async findAll(query: ReviewQueryDto): Promise<PaginatedResult<Review>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.productId) {
      where.productId = new ObjectId(query.productId);
    }

    if (query.userId) {
      where.userId = new ObjectId(query.userId);
    }

    if (query.isApproved !== undefined) {
      where.isApproved = query.isApproved;
    }

    if (query.rating) {
      where.rating = query.rating;
    }

    const [data, total] = await this.repository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async findByProduct(
    productId: ObjectId,
    query: ReviewQueryDto,
  ): Promise<PaginatedResult<Review>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      productId,
      isApproved: true,
    };

    if (query.rating) {
      where.rating = query.rating;
    }

    const [data, total] = await this.repository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async findById(id: ObjectId | string): Promise<Review | null> {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.repository.findOne({ where: { _id: objectId } as Record<string, unknown> });
    } catch {
      return null;
    }
  }

  async findByProductAndUser(productId: ObjectId, userId: ObjectId): Promise<Review | null> {
    return this.repository.findOne({
      where: { productId, userId } as Record<string, unknown>,
    });
  }

  async create(data: Partial<Review>): Promise<Review> {
    const review = this.repository.create(data);
    return this.repository.save(review);
  }

  async update(id: ObjectId | string, data: Partial<Review>): Promise<Review | null> {
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

  async calculateProductRating(productId: ObjectId): Promise<{ rating: number; count: number }> {
    const reviews = await this.repository.find({
      where: { productId, isApproved: true } as Record<string, unknown>,
      select: ['rating'],
    });

    const count = reviews.length;
    if (count === 0) {
      return { rating: 0, count: 0 };
    }

    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    const rating = Math.round((sum / count) * 10) / 10;

    return { rating, count };
  }
}
