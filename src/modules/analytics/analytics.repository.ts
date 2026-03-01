import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { AnalyticsDaily } from './entities/analytics.entity';

@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectRepository(AnalyticsDaily)
    private readonly repository: Repository<AnalyticsDaily>,
  ) {}

  async findByDate(date: Date): Promise<AnalyticsDaily | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    return this.repository.findOne({
      where: { date: startOfDay },
    });
  }

  async findByDateRange(dateFrom: Date, dateTo: Date): Promise<AnalyticsDaily[]> {
    return this.repository.find({
      where: {
        date: Between(dateFrom, dateTo),
      },
      order: { date: 'ASC' },
    });
  }

  async upsertDaily(date: Date, data: Partial<AnalyticsDaily>): Promise<AnalyticsDaily> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await this.findByDate(startOfDay);

    if (existing) {
      await this.repository.update(existing.id, data as any);
      return (await this.findByDate(startOfDay))!;
    }

    const entity = this.repository.create({ ...data, date: startOfDay });
    return this.repository.save(entity);
  }

  async incrementField(date: Date, field: string, value: number = 1): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await this.findByDate(startOfDay);

    if (existing) {
      const currentValue = Number((existing as unknown as Record<string, unknown>)[field]) || 0;
      await this.repository.update(existing.id, { [field]: currentValue + value });
    } else {
      const entity = this.repository.create({
        date: startOfDay,
        [field]: value,
      });
      await this.repository.save(entity);
    }
  }

  async getLatest(): Promise<AnalyticsDaily | null> {
    return this.repository.findOne({
      order: { date: 'DESC' },
    });
  }
}
