import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
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

    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.userId) {
      where.userId = new ObjectId(query.userId);
    }

    if (query.search) {
      where.$or = [
        { orderNumber: { $regex: query.search, $options: 'i' } },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (query.dateFrom) dateFilter.$gte = new Date(query.dateFrom);
      if (query.dateTo) dateFilter.$lte = new Date(query.dateTo);
      where.createdAt = dateFilter;
    }

    if (query.minTotal !== undefined || query.maxTotal !== undefined) {
      const totalFilter: Record<string, number> = {};
      if (query.minTotal !== undefined) totalFilter.$gte = query.minTotal;
      if (query.maxTotal !== undefined) totalFilter.$lte = query.maxTotal;
      where.total = totalFilter;
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

  async findByUser(userId: ObjectId | string, query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return this.findAll({ ...query, userId: userObjectId.toString() });
  }

  async findById(id: ObjectId | string): Promise<Order | null> {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.repository.findOne({ where: { _id: objectId } as Record<string, unknown> });
    } catch {
      return null;
    }
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    return this.repository.findOne({ where: { orderNumber } as Record<string, unknown> });
  }

  async create(data: Partial<Order>): Promise<Order> {
    const order = this.repository.create(data);
    return this.repository.save(order);
  }

  async update(id: ObjectId | string, data: Partial<Order>): Promise<Order | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as Record<string, unknown>,
      data as Record<string, unknown>,
    );
    return this.findById(objectId);
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
    const where: Record<string, unknown> = {
      status: { $nin: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
    };

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.$gte = dateFrom;
      if (dateTo) dateFilter.$lte = dateTo;
      where.createdAt = dateFilter;
    }

    const orders = await this.repository.find({ where, select: ['total'] });

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
    return { totalRevenue: Math.round(totalRevenue * 100) / 100, count: orders.length };
  }

  async getLastOrderNumber(): Promise<string | null> {
    const order = await this.repository.findOne({
      where: {} as Record<string, unknown>,
      order: { orderNumber: 'DESC' },
      select: ['orderNumber'],
    });
    return order?.orderNumber ?? null;
  }
}
