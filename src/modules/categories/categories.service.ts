import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import slugify from 'slugify';
import Redis from 'ioredis';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';

const CACHE_KEY_LIST = 'categories:list';
const CACHE_KEY_TREE = 'categories:tree';
const CACHE_TTL = 3600; // 1 hour

@Injectable()
export class CategoriesService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    @InjectRepository(Category)
    private readonly repository: Repository<Category>,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password'),
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async findAll(): Promise<Category[]> {
    const cached = await this.redis.get(CACHE_KEY_LIST);
    if (cached) {
      return JSON.parse(cached);
    }

    const categories = await this.repository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });

    await this.redis.set(CACHE_KEY_LIST, JSON.stringify(categories), 'EX', CACHE_TTL);
    return categories;
  }

  async findTree(): Promise<Category[]> {
    const cached = await this.redis.get(CACHE_KEY_TREE);
    if (cached) {
      return JSON.parse(cached);
    }

    const categories = await this.repository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });

    const tree = this.buildTree(categories);

    await this.redis.set(CACHE_KEY_TREE, JSON.stringify(tree), 'EX', CACHE_TTL);
    return tree;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.repository.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException(`Категория со slug "${slug}" не найдена`);
    }
    return category;
  }

  async findById(id: string): Promise<Category> {
    const category = await this.repository.findOne({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug || this.generateSlug(dto.name);
    const existing = await this.repository.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Категория со slug "${slug}" уже существует`);
    }

    if (dto.parentId) {
      await this.findById(dto.parentId);
    }

    const category = this.repository.create({
      ...dto,
      slug,
      parentId: dto.parentId || undefined,
    });

    const saved = await this.repository.save(category);
    await this.invalidateCache();
    return saved;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);

    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.repository.findOne({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Категория со slug "${dto.slug}" уже существует`);
      }
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        if (dto.parentId === id) {
          throw new BadRequestException('Категория не может быть родителем самой себя');
        }
        await this.findById(dto.parentId);
        await this.checkCircularDependency(id, dto.parentId);
      }
    }

    const updateData: any = { ...dto };
    if (dto.parentId !== undefined) {
      updateData.parentId = dto.parentId || null;
    }

    await this.repository.update(id, updateData);
    await this.invalidateCache();
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);

    const children = await this.repository.find({
      where: { parentId: id },
    });
    if (children.length > 0) {
      throw new BadRequestException(
        'Невозможно удалить категорию с подкатегориями. Сначала удалите или переместите подкатегории.',
      );
    }

    await this.repository.delete(id);
    await this.invalidateCache();
  }

  async reorder(dto: ReorderCategoriesDto): Promise<void> {
    const updates = dto.items.map((item) =>
      this.repository.update(item.id, { order: item.order }),
    );

    await Promise.all(updates);
    await this.invalidateCache();
  }

  private buildTree(categories: Category[]): Category[] {
    const map = new Map<string, Category>();
    const roots: Category[] = [];

    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) {
          parent.children!.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async checkCircularDependency(
    categoryId: string,
    newParentId: string,
  ): Promise<void> {
    let currentId: string | undefined = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException('Обнаружена циклическая зависимость категорий');
      }
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      const parent = await this.repository.findOne({
        where: { id: currentId },
      });
      currentId = parent?.parentId;
    }
  }

  private generateSlug(name: string): string {
    return slugify(name, { lower: true, strict: true });
  }

  private async invalidateCache(): Promise<void> {
    await this.redis.del(CACHE_KEY_LIST, CACHE_KEY_TREE);
  }
}
