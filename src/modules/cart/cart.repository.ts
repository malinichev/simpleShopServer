import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import { Cart } from './entities/cart.entity';

@Injectable()
export class CartRepository {
  constructor(
    @InjectRepository(Cart)
    private readonly repository: Repository<Cart>,
  ) {}

  async findById(id: string): Promise<Cart | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['items'],
    });
  }

  async findByUserId(userId: string): Promise<Cart | null> {
    return this.repository.findOne({
      where: { userId },
      relations: ['items'],
    });
  }

  async findBySessionId(sessionId: string): Promise<Cart | null> {
    return this.repository.findOne({
      where: { sessionId },
      relations: ['items'],
    });
  }

  async create(data: Partial<Cart>): Promise<Cart> {
    const cart = this.repository.create(data);
    return this.repository.save(cart);
  }

  async update(id: string, data: Partial<Cart>): Promise<Cart | null> {
    await this.repository.update(id, data as any);
    return this.findById(id);
  }

  async save(cart: Cart): Promise<Cart> {
    return this.repository.save(cart);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteExpired(): Promise<void> {
    await this.repository.delete({
      expiresAt: LessThanOrEqual(new Date()),
      userId: IsNull(),
    });
  }
}
