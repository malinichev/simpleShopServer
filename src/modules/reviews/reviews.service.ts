import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ReviewsRepository } from './reviews.repository';
import { ExternalReviewsRepository } from './external-reviews.repository';
import { OrdersService } from '@/modules/orders/orders.service';
import { ProductsService } from '@/modules/products/products.service';
import { ProductsRepository } from '@/modules/products/products.repository';
import { UsersService } from '@/modules/users/users.service';
import { Review } from './entities/review.entity';
import { ExternalReview } from './entities/external-review.entity';
import {
  CreateReviewDto,
  UpdateReviewDto,
  ReviewQueryDto,
  ReviewResponseDto,
  ReviewsSummaryDto,
  ReviewEligibilityDto,
} from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';
import { OrderStatus } from '@/modules/orders/entities/order.entity';

const CACHE_PREFIX = 'reviews';
const CACHE_TTL = 300; // 5 minutes

interface RatingUpdate {
  id: string;
  rating: number;
  count: number;
}

@Injectable()
export class ReviewsService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly externalReviewsRepository: ExternalReviewsRepository,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly productsRepository: ProductsRepository,
    private readonly usersService: UsersService,
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

  async create(
    userId: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<Review> {
    // Проверить что товар существует
    await this.productsService.findById(productId);

    // Проверить что пользователь купил товар (orderId валиден)
    const order = await this.ordersService.findById(dto.orderId);
    if (order.userId !== userId) {
      throw new ForbiddenException(
        'Заказ не принадлежит текущему пользователю',
      );
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Отзыв можно оставить только на доставленный заказ',
      );
    }

    const hasProduct = order.items.some((item) => item.productId === productId);
    if (!hasProduct) {
      throw new BadRequestException('Товар не найден в указанном заказе');
    }

    // Один отзыв на товар от пользователя
    const existing = await this.reviewsRepository.findByProductAndUser(
      productId,
      userId,
    );
    if (existing) {
      throw new ConflictException('Вы уже оставили отзыв на этот товар');
    }

    const review = await this.reviewsRepository.create({
      productId,
      userId,
      orderId: dto.orderId,
      rating: dto.rating,
      title: dto.title,
      text: dto.text,
      images: dto.images || [],
      isAnonymous: dto.isAnonymous ?? false,
      isApproved: false,
    });

    await this.invalidateReviewsCache();
    return review;
  }

  /**
   * Публичные отзывы товара: свои одобренные + нескрытые внешние, единая
   * лента по дате. В ответе summary — разбивка по источникам и общий рейтинг.
   */
  async findByProduct(
    productId: string,
    query: ReviewQueryDto,
  ): Promise<PaginatedResult<ReviewResponseDto> & { summary: ReviewsSummaryDto }> {
    const cacheKey = `${CACHE_PREFIX}:product:${productId}:${JSON.stringify(query)}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PaginatedResult<ReviewResponseDto> & {
        summary: ReviewsSummaryDto;
      };
    }

    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;

    const [localReviews, externalReviews] = await Promise.all([
      this.reviewsRepository.findByProduct(productId, {
        page: 1,
        limit: 100,
        rating: query.rating,
      } as ReviewQueryDto),
      this.externalReviewsRepository.findVisibleByProduct(productId),
    ]);

    const userIds = [
      ...new Set(localReviews.data.map((r) => r.userId)),
    ];
    const users = await this.usersService.findByIds(userIds);
    const usersMap = new Map(users.map((u) => [u.id, u]));

    const localDtos = localReviews.data.map((review) => {
      const user = usersMap.get(review.userId);
      return this.toResponseDto(review, user);
    });
    const externalDtos = (query.rating
      ? externalReviews.filter((er) => er.rating === query.rating)
      : externalReviews
    ).map((er) => this.toExternalResponseDto(er));

    // Единая лента: свежие сверху (у внешних дата — sourceCreatedAt)
    const merged = [...localDtos, ...externalDtos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const response = {
      data: merged.slice((page - 1) * limit, page * limit),
      meta: createPaginationMeta(page, limit, merged.length),
      summary: await this.buildSummary(productId),
    };
    await this.redis.set(cacheKey, JSON.stringify(response), 'EX', CACHE_TTL);
    return response;
  }

  /** Админ-лента отзывов: свои, поставщика или все вместе (source). */
  async findAll(
    query: ReviewQueryDto,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;

    if (query.source === 'sima-land') {
      const { data, total } = await this.externalReviewsRepository.findForAdmin(
        { page, limit, rating: query.rating },
      );
      return {
        data: data.map((er) => this.toExternalResponseDto(er)),
        meta: createPaginationMeta(page, limit, total),
      };
    }

    if (query.source === 'local') {
      const result = await this.reviewsRepository.findAll({
        ...query,
        source: undefined,
      });
      const userIds = [...new Set(result.data.map((r) => r.userId))];
      const users = await this.usersService.findByIds(userIds);
      const usersMap = new Map(users.map((u) => [u.id, u]));
      return {
        data: result.data.map((review) =>
          this.toResponseDto(review, usersMap.get(review.userId)),
        ),
        meta: result.meta,
      };
    }

    // Все источники вместе: обе страницы → общий сортированный срез
    const [localResult, externalResult] = await Promise.all([
      this.reviewsRepository.findAll({ ...query, source: undefined }),
      this.externalReviewsRepository.findForAdmin({ page, limit, rating: query.rating }),
    ]);
    const userIds = [...new Set(localResult.data.map((r) => r.userId))];
    const users = await this.usersService.findByIds(userIds);
    const usersMap = new Map(users.map((u) => [u.id, u]));

    const localDtos = localResult.data.map((review) =>
      this.toResponseDto(review, usersMap.get(review.userId)),
    );
    const merged = [
      ...localDtos,
      ...externalResult.data.map((er) => this.toExternalResponseDto(er)),
    ].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = localResult.meta.total + externalResult.total;
    return {
      data: merged.slice(0, limit),
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async findById(id: string): Promise<Review> {
    const review = await this.reviewsRepository.findById(id);
    if (!review) {
      throw new NotFoundException('Отзыв не найден');
    }
    return review;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateReviewDto,
  ): Promise<Review> {
    const review = await this.findById(id);

    if (review.userId !== userId) {
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
    await this.recalculateCombinedRatings([review.productId]);
    await this.invalidateReviewsCache();

    return updated;
  }

  async delete(id: string, userId?: string, isAdmin?: boolean): Promise<void> {
    const review = await this.findById(id);

    if (!isAdmin && review.userId !== userId) {
      throw new ForbiddenException('Нет прав для удаления этого отзыва');
    }

    await this.reviewsRepository.delete(id);

    // Пересчитать рейтинг товара
    await this.recalculateCombinedRatings([review.productId]);
    await this.invalidateReviewsCache();
  }

  async approve(id: string): Promise<Review> {
    const review = await this.findById(id);

    const updated = await this.reviewsRepository.update(id, {
      isApproved: true,
    });
    if (!updated) {
      throw new NotFoundException('Отзыв не найден');
    }

    // Пересчитать рейтинг товара
    await this.recalculateCombinedRatings([review.productId]);
    await this.invalidateReviewsCache();

    return updated;
  }

  async reject(id: string): Promise<void> {
    const review = await this.findById(id);

    await this.reviewsRepository.update(id, { isApproved: false });

    // Пересчитать рейтинг товара
    await this.recalculateCombinedRatings([review.productId]);
    await this.invalidateReviewsCache();
  }

  /** Скрыть/показать внешний отзыв (модерация витрины без удаления). */
  async setExternalHidden(id: string, isHidden: boolean): Promise<ExternalReview> {
    const existing = await this.externalReviewsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Внешний отзыв не найден');
    }

    await this.externalReviewsRepository.setHidden(id, isHidden);
    await this.recalculateCombinedRatings([existing.productId]);
    await this.invalidateReviewsCache();
    await this.productsService.invalidateCache();

    return { ...existing, isHidden };
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

    await this.invalidateReviewsCache();
    return updated;
  }

  async calculateProductRating(
    productId: string,
  ): Promise<{ rating: number; count: number }> {
    return this.reviewsRepository.calculateProductRating(productId);
  }

  /**
   * Комбинированный рейтинг товаров: products.rating/reviewsCount = свои
   * одобренные + внешние нескрытые. Вызывается после изменений отзывов
   * (свои: create/approve/reject/delete, внешние: скрытие) и после
   * прогона reviews-sync (productIds = undefined — полный пересчёт).
   */
  async recalculateCombinedRatings(productIds?: string[]): Promise<void> {
    const [local, external] = await Promise.all([
      this.reviewsRepository.ratingStats(productIds),
      this.externalReviewsRepository.ratingStats(productIds),
    ]);

    const ids = new Set<string>([
      ...local.keys(),
      ...external.keys(),
      ...(productIds ?? []),
    ]);

    const updates: RatingUpdate[] = [];
    for (const id of ids) {
      const l = local.get(id) ?? { count: 0, sum: 0 };
      const e = external.get(id) ?? { count: 0, sum: 0 };
      const count = l.count + e.count;
      const rating =
        count > 0 ? Math.round(((l.sum + e.sum) / count) * 10) / 10 : 0;
      updates.push({ id, rating, count });
    }

    for (const entry of updates) {
      await this.productsRepository.updateRating(entry.id, entry.rating, entry.count);
    }
    await this.productsService.invalidateCache();
  }

  /** Кэш отзывов (публичный — сбрасывается и reviews-sync'ом). */
  async invalidateReviewsCache(): Promise<void> {
    const keys = await this.redis.keys(`${CACHE_PREFIX}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  toResponseDto(
    review: Review,
    user?: { id: string; firstName: string; lastName: string },
  ): ReviewResponseDto {
    const isAnonymous = review.isAnonymous ?? false;

    return {
      id: review.id,
      productId: review.productId,
      source: 'local',
      userId: review.userId,
      user: isAnonymous
        ? undefined
        : user
          ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
            }
          : undefined,
      orderId: review.orderId,
      rating: review.rating,
      title: review.title,
      text: review.text,
      images: review.images || [],
      isAnonymous,
      isVerifiedPurchase: true, // свой отзыв возможен только после заказа
      isApproved: review.isApproved,
      adminReply: review.adminReply,
      adminReplyAt: review.adminReplyAt,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  toExternalResponseDto(er: ExternalReview): ReviewResponseDto {
    return {
      id: er.id,
      productId: er.productId,
      source: er.source,
      authorName: er.authorName,
      rating: er.rating,
      text: er.message,
      pros: er.pros ?? undefined,
      cons: er.cons ?? undefined,
      images: er.images || [],
      isAnonymous: er.authorName === 'Анонимно',
      isVerifiedPurchase: er.isVerifiedPurchase,
      isApproved: true, // внешние отзывы уже опубликованы поставщиком
      isHidden: er.isHidden,
      adminReply: er.reply ?? undefined,
      createdAt: (er.sourceCreatedAt ?? er.createdAt) as Date,
      updatedAt: er.updatedAt,
    };
  }

  private async buildSummary(productId: string): Promise<ReviewsSummaryDto> {
    const [local, external, product] = await Promise.all([
      this.reviewsRepository.calculateProductRating(productId),
      this.externalReviewsRepository
        .ratingStats([productId])
        .then((stats) => stats.get(productId)),
      this.productsService.findById(productId).catch(() => null),
    ]);
    const ext = external ?? { count: 0, sum: 0 };
    const externalRating =
      ext.count > 0 ? Math.round((ext.sum / ext.count) * 10) / 10 : 0;
    const total = local.count + ext.count;

    return {
      localCount: local.count,
      localRating: local.rating,
      externalCount: ext.count,
      externalRating,
      rating: product?.rating ?? (total > 0 ? local.rating : 0),
      total,
    };
  }

  async checkReviewEligibility(
    userId: string,
    productId: string,
  ): Promise<ReviewEligibilityDto> {
    // Check if user already reviewed this product
    const existing = await this.reviewsRepository.findByProductAndUser(
      productId,
      userId,
    );
    if (existing) {
      return { canReview: false, eligibleOrders: [], hasReviewed: true };
    }

    // Find delivered orders for this user
    const ordersResult = await this.ordersService.findByUser(userId, {
      status: OrderStatus.DELIVERED,
      limit: 100,
    });

    // Filter orders that contain this product
    const eligibleOrders = ordersResult.data
      .filter((order) =>
        order.items.some((item) => item.productId === productId),
      )
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        items: order.items
          .filter((item) => item.productId === productId)
          .map((item) => ({
            name: item.name,
            image: item.image,
            size: item.size,
            color: item.color,
          })),
      }));

    return {
      canReview: eligibleOrders.length > 0,
      eligibleOrders,
      hasReviewed: false,
    };
  }
}
