import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageFileRecord } from './entities/page-file.entity';

@Injectable()
export class PageFilesRepository {
  constructor(
    @InjectRepository(PageFileRecord)
    private readonly repository: Repository<PageFileRecord>,
  ) {}

  async findAll(): Promise<PageFileRecord[]> {
    return this.repository.find({ order: { createdAt: 'DESC' } });
  }

  async findByKey(key: string): Promise<PageFileRecord | null> {
    return this.repository.findOne({ where: { key } });
  }

  async create(data: Partial<PageFileRecord>): Promise<PageFileRecord> {
    const record = this.repository.create(data);
    return this.repository.save(record);
  }

  async deleteByKey(key: string): Promise<void> {
    await this.repository.delete({ key });
  }

  async deleteById(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
