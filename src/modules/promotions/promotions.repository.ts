import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Promotion } from './entities/promotion.entity';

@Injectable()
export class PromotionsRepository {
  constructor(
    @InjectRepository(Promotion)
    private readonly repository: Repository<Promotion>,
  ) {}

  async findAll(): Promise<Promotion[]> {
    return this.repository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: ObjectId | string): Promise<Promotion | null> {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.repository.findOne({
        where: { _id: objectId } as Record<string, unknown>,
      });
    } catch {
      return null;
    }
  }

  async findByCode(code: string): Promise<Promotion | null> {
    return this.repository.findOne({
      where: { code: code.toUpperCase() } as Record<string, unknown>,
    });
  }

  async create(data: Partial<Promotion>): Promise<Promotion> {
    const promotion = this.repository.create(data);
    return this.repository.save(promotion);
  }

  async update(id: ObjectId | string, data: Partial<Promotion>): Promise<Promotion | null> {
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

  async incrementUsage(
    id: ObjectId | string,
    usedCount: number,
    userUsage: Record<string, number>,
  ): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as Record<string, unknown>,
      { usedCount, userUsage },
    );
  }
}
