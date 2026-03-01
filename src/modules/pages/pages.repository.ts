import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Page } from './entities/page.entity';

@Injectable()
export class PagesRepository {
  constructor(
    @InjectRepository(Page)
    private readonly repository: Repository<Page>,
  ) {}

  async findAll(): Promise<Page[]> {
    return this.repository.find({ order: { createdAt: 'DESC' } });
  }

  async findBySlug(slug: string): Promise<Page | null> {
    return this.repository.findOne({ where: { slug } });
  }

  async findById(id: string): Promise<Page | null> {
    return this.repository.findOne({ where: { id } });
  }

  async create(data: Partial<Page>): Promise<Page> {
    const page = this.repository.create(data);
    return this.repository.save(page);
  }

  async update(slug: string, data: Partial<Page>): Promise<Page | null> {
    await this.repository.update({ slug }, data as any);
    return this.findBySlug(slug);
  }

  async delete(slug: string): Promise<void> {
    await this.repository.delete({ slug });
  }
}
