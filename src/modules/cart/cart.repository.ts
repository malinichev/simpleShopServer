import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Cart } from './entities/cart.entity';

@Injectable()
export class CartRepository {
  constructor(
    @InjectRepository(Cart)
    private readonly repository: Repository<Cart>,
  ) {}

  async findById(id: ObjectId | string): Promise<Cart | null> {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.repository.findOne({ where: { _id: objectId } as Record<string, unknown> });
    } catch {
      return null;
    }
  }

  async findByUserId(userId: ObjectId | string): Promise<Cart | null> {
    const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    return this.repository.findOne({ where: { userId: objectId } as Record<string, unknown> });
  }

  async findBySessionId(sessionId: string): Promise<Cart | null> {
    return this.repository.findOne({ where: { sessionId } as Record<string, unknown> });
  }

  async create(data: Partial<Cart>): Promise<Cart> {
    const cart = this.repository.create(data);
    return this.repository.save(cart);
  }

  async update(id: ObjectId | string, data: Partial<Cart>): Promise<Cart | null> {
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

  async deleteExpired(): Promise<void> {
    await this.repository.delete({
      expiresAt: { $lte: new Date() },
      userId: null,
    } as Record<string, unknown>);
  }
}
