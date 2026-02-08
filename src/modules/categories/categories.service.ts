import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
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
    const category = await this.repository.findOne({ where: { slug } as any });
    if (!category) {
      throw new NotFoundException(`Категория со slug "${slug}" не найдена`);
    }
    return category;
  }

  async findById(id: ObjectId | string): Promise<Category> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const category = await this.repository.findOne({
      where: { _id: objectId } as any,
    });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug || this.generateSlug(dto.name);
    const existing = await this.repository.findOne({ where: { slug } as any });
    if (existing) {
      throw new ConflictException(`Категория со slug "${slug}" уже существует`);
    }

    if (dto.parentId) {
      await this.findById(dto.parentId);
    }

    const category = this.repository.create({
      ...dto,
      slug,
      parentId: dto.parentId ? new ObjectId(dto.parentId) : undefined,
    });

    const saved = await this.repository.save(category);
    await this.invalidateCache();
    return saved;
  }

  async update(id: ObjectId | string, dto: UpdateCategoryDto): Promise<Category> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const category = await this.findById(objectId);

    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.repository.findOne({
        where: { slug: dto.slug } as any,
      });
      if (existing && existing._id.toString() !== objectId.toString()) {
        throw new ConflictException(`Категория со slug "${dto.slug}" уже существует`);
      }
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        if (dto.parentId === objectId.toString()) {
          throw new BadRequestException('Категория не может быть родителем самой себя');
        }
        await this.findById(dto.parentId);
        await this.checkCircularDependency(objectId, new ObjectId(dto.parentId));
      }
    }

    const updateData: any = { ...dto };
    if (dto.parentId !== undefined) {
      updateData.parentId = dto.parentId ? new ObjectId(dto.parentId) : null;
    }

    await this.repository.update({ _id: objectId } as any, updateData);
    await this.invalidateCache();
    return this.findById(objectId);
  }

  async delete(id: ObjectId | string): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.findById(objectId);

    const children = await this.repository.find({
      where: { parentId: objectId } as any,
    });
    if (children.length > 0) {
      throw new BadRequestException(
        'Невозможно удалить категорию с подкатегориями. Сначала удалите или переместите подкатегории.',
      );
    }

    await this.repository.delete({ _id: objectId } as any);
    await this.invalidateCache();
  }

  async reorder(dto: ReorderCategoriesDto): Promise<void> {
    const updates = dto.items.map((item) =>
      this.repository.update(
        { _id: new ObjectId(item.id) } as any,
        { order: item.order },
      ),
    );

    await Promise.all(updates);
    await this.invalidateCache();
  }

  private buildTree(categories: Category[]): Category[] {
    const map = new Map<string, Category>();
    const roots: Category[] = [];

    for (const cat of categories) {
      map.set(cat._id.toString(), { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat._id.toString())!;
      if (cat.parentId) {
        const parent = map.get(cat.parentId.toString());
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
    categoryId: ObjectId,
    newParentId: ObjectId,
  ): Promise<void> {
    let currentId: ObjectId | undefined = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      const key = currentId.toString();
      if (key === categoryId.toString()) {
        throw new BadRequestException('Обнаружена циклическая зависимость категорий');
      }
      if (visited.has(key)) {
        break;
      }
      visited.add(key);

      const parent = await this.repository.findOne({
        where: { _id: currentId } as any,
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
