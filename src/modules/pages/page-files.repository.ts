import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
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
    return this.repository.findOne({ where: { key } as Record<string, unknown> });
  }

  async create(data: Partial<PageFileRecord>): Promise<PageFileRecord> {
    const record = this.repository.create(data);
    return this.repository.save(record);
  }

  async deleteByKey(key: string): Promise<void> {
    await this.repository.delete({ key } as Record<string, unknown>);
  }

  async deleteById(id: ObjectId | string): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.delete({ _id: objectId } as Record<string, unknown>);
  }
}
