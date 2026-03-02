import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
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

    const where: FindOptionsWhere<Review> = {};

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.userId) {
      where.userId = query.userId;
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
    productId: string,
    query: ReviewQueryDto,
  ): Promise<PaginatedResult<Review>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Review> = {
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

  async findById(id: string): Promise<Review | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByProductAndUser(
    productId: string,
    userId: string,
  ): Promise<Review | null> {
    return this.repository.findOne({
      where: { productId, userId },
    });
  }

  async create(data: Partial<Review>): Promise<Review> {
    const review = this.repository.create(data);
    return this.repository.save(review);
  }

  async update(id: string, data: Partial<Review>): Promise<Review | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async calculateProductRating(
    productId: string,
  ): Promise<{ rating: number; count: number }> {
    const reviews = await this.repository.find({
      where: { productId, isApproved: true },
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
