import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findById(id: string): Promise<Promotion | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<Promotion | null> {
    return this.repository.findOne({
      where: { code: code.toUpperCase() },
    });
  }

  async create(data: Partial<Promotion>): Promise<Promotion> {
    const promotion = this.repository.create(data);
    return this.repository.save(promotion);
  }

  async update(id: string, data: Partial<Promotion>): Promise<Promotion | null> {
    await this.repository.update(id, data as any);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async incrementUsage(
    id: string,
    usedCount: number,
    userUsage: Record<string, number>,
  ): Promise<void> {
    await this.repository.update(id, { usedCount, userUsage } as any);
  }
}
