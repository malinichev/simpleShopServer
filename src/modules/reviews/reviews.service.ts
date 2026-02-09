import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import Redis from 'ioredis';
import { ReviewsRepository } from './reviews.repository';
import { OrdersService } from '@/modules/orders/orders.service';
import { ProductsService } from '@/modules/products/products.service';
import { Review } from './entities/review.entity';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ReviewQueryDto,
  ReviewResponseDto,
} from './dto';
import { PaginatedResult } from '@/common/types/pagination.types';
import { OrderStatus } from '@/modules/orders/entities/order.entity';

const CACHE_PREFIX = 'reviews';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class ReviewsService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
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

  async create(userId: string, productId: string, dto: CreateReviewDto): Promise<Review> {
    const userObjectId = new ObjectId(userId);
    const productObjectId = new ObjectId(productId);

    // Проверить что товар существует
    await this.productsService.findById(productId);

    // Проверить что пользователь купил товар (orderId валиден)
    const order = await this.ordersService.findById(dto.orderId);
    if (order.userId.toString() !== userId) {
      throw new ForbiddenException('Заказ не принадлежит текущему пользователю');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Отзыв можно оставить только на доставленный заказ');
    }

    const hasProduct = order.items.some(
      (item) => item.productId.toString() === productId,
    );
    if (!hasProduct) {
      throw new BadRequestException('Товар не найден в указанном заказе');
    }

    // Один отзыв на товар от пользователя
    const existing = await this.reviewsRepository.findByProductAndUser(
      productObjectId,
      userObjectId,
    );
    if (existing) {
      throw new ConflictException('Вы уже оставили отзыв на этот товар');
    }

    const review = await this.reviewsRepository.create({
      productId: productObjectId,
      userId: userObjectId,
      orderId: new ObjectId(dto.orderId),
      rating: dto.rating,
      title: dto.title,
      text: dto.text,
      images: dto.images || [],
      isApproved: false,
    });

    await this.invalidateCache();
    return review;
  }

  async findByProduct(
    productId: string,
    query: ReviewQueryDto,
  ): Promise<PaginatedResult<Review>> {
    const cacheKey = `${CACHE_PREFIX}:product:${productId}:${JSON.stringify(query)}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.reviewsRepository.findByProduct(
      new ObjectId(productId),
      query,
    );

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async findAll(query: ReviewQueryDto): Promise<PaginatedResult<Review>> {
    return this.reviewsRepository.findAll(query);
  }

  async findById(id: string): Promise<Review> {
    const review = await this.reviewsRepository.findById(id);
    if (!review) {
      throw new NotFoundException('Отзыв не найден');
    }
    return review;
  }

  async update(id: string, userId: string, dto: UpdateReviewDto): Promise<Review> {
    const review = await this.findById(id);

    if (review.userId.toString() !== userId) {
      throw new ForbiddenException('Нет прав для редактирования этого отзыва');
    }

    const updateData: Partial<Review> = {};

    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.text !== undefined) updateData.text = dto.text;

    // При редактировании сбрасываем одобрение
    updateData.isApproved = false;

    const updated = await this.reviewsRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException('Отзыв не найден');
    }

    // Пересчитать рейтинг товара (отзыв стал неодобренным)
    await this.recalculateProductRating(review.productId.toString());
    await this.invalidateCache();

    return updated;
  }

  async delete(id: string, userId?: string, isAdmin?: boolean): Promise<void> {
    const review = await this.findById(id);

    if (!isAdmin && review.userId.toString() !== userId) {
      throw new ForbiddenException('Нет прав для удаления этого отзыва');
    }

    await this.reviewsRepository.delete(id);

    // Пересчитать рейтинг товара
    await this.recalculateProductRating(review.productId.toString());
    await this.invalidateCache();
  }

  async approve(id: string): Promise<Review> {
    const review = await this.findById(id);

    const updated = await this.reviewsRepository.update(id, { isApproved: true });
    if (!updated) {
      throw new NotFoundException('Отзыв не найден');
    }

    // Пересчитать рейтинг товара
    await this.recalculateProductRating(review.productId.toString());
    await this.invalidateCache();

    return updated;
  }

  async reject(id: string): Promise<void> {
    const review = await this.findById(id);

    await this.reviewsRepository.update(id, { isApproved: false });

    // Пересчитать рейтинг товара
    await this.recalculateProductRating(review.productId.toString());
    await this.invalidateCache();
  }

  async addReply(id: string, adminId: string, text: string): Promise<Review> {
    await this.findById(id);

    const updated = await this.reviewsRepository.update(id, {
      adminReply: text,
      adminReplyAt: new Date(),
    });
    if (!updated) {
      throw new NotFoundException('Отзыв не найден');
    }

    await this.invalidateCache();
    return updated;
  }

  async calculateProductRating(productId: string): Promise<{ rating: number; count: number }> {
    return this.reviewsRepository.calculateProductRating(new ObjectId(productId));
  }

  toResponseDto(
    review: Review,
    user?: { _id: ObjectId; firstName: string; lastName: string },
  ): ReviewResponseDto {
    return {
      _id: review._id.toString(),
      productId: review.productId.toString(),
      userId: review.userId.toString(),
      user: user
        ? {
            _id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
          }
        : undefined,
      orderId: review.orderId.toString(),
      rating: review.rating,
      title: review.title,
      text: review.text,
      images: review.images || [],
      isApproved: review.isApproved,
      adminReply: review.adminReply,
      adminReplyAt: review.adminReplyAt,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private async recalculateProductRating(productId: string): Promise<void> {
    const { rating, count } = await this.calculateProductRating(productId);
    await this.productsService.updateRating(productId, rating, count);
  }

  private async invalidateCache(): Promise<void> {
    const keys = await this.redis.keys(`${CACHE_PREFIX}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
