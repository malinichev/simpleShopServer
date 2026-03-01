import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, ILike, MoreThanOrEqual, LessThanOrEqual, FindOptionsWhere, Between } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { OrderQueryDto } from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repository: Repository<Order>,
  ) {}

  async findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Order> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    // Build date/total range conditions via QueryBuilder for complex filters
    const qb = this.repository.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item');

    // Apply simple where conditions
    if (where.status) qb.andWhere('order.status = :status', { status: where.status });
    if (where.paymentStatus) qb.andWhere('order.paymentStatus = :paymentStatus', { paymentStatus: where.paymentStatus });
    if (where.userId) qb.andWhere('order.userId = :userId', { userId: where.userId });

    if (query.search) {
      qb.andWhere('order.orderNumber ILIKE :search', { search: `%${query.search}%` });
    }

    if (query.dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(query.dateFrom) });
    }
    if (query.dateTo) {
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: new Date(query.dateTo) });
    }

    if (query.minTotal !== undefined) {
      qb.andWhere('order.total >= :minTotal', { minTotal: query.minTotal });
    }
    if (query.maxTotal !== undefined) {
      qb.andWhere('order.total <= :maxTotal', { maxTotal: query.maxTotal });
    }

    qb.orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async findByUser(userId: string, query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    return this.findAll({ ...query, userId });
  }

  async findById(id: string): Promise<Order | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['items'],
    });
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    return this.repository.findOne({
      where: { orderNumber },
      relations: ['items'],
    });
  }

  async create(data: Partial<Order>): Promise<Order> {
    const order = this.repository.create(data);
    return this.repository.save(order);
  }

  async update(id: string, data: Partial<Order>): Promise<Order | null> {
    await this.repository.update(id, data as any);
    return this.findById(id);
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async countByStatus(): Promise<Record<string, number>> {
    const orders = await this.repository.find({ select: ['status'] });
    return orders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async countByPaymentStatus(): Promise<Record<string, number>> {
    const orders = await this.repository.find({ select: ['paymentStatus'] });
    return orders.reduce(
      (acc, order) => {
        acc[order.paymentStatus] = (acc[order.paymentStatus] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async getRevenueStats(dateFrom?: Date, dateTo?: Date): Promise<{ totalRevenue: number; count: number }> {
    const qb = this.repository.createQueryBuilder('order')
      .select('SUM(order.total)', 'totalRevenue')
      .addSelect('COUNT(*)', 'count')
      .where('order.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
      });

    if (dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('order.createdAt <= :dateTo', { dateTo });
    }

    const result = await qb.getRawOne();
    return {
      totalRevenue: Math.round((Number(result.totalRevenue) || 0) * 100) / 100,
      count: Number(result.count) || 0,
    };
  }

  async getLastOrderNumber(): Promise<string | null> {
    const order = await this.repository.findOne({
      order: { orderNumber: 'DESC' },
      select: ['orderNumber'],
    });
    return order?.orderNumber ?? null;
  }
}
