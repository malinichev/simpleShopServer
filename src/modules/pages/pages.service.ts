import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PagesRepository } from './pages.repository';
import { PageFilesRepository } from './page-files.repository';
import { UploadService } from '@/modules/upload/upload.service';
import { Page } from './entities/page.entity';
import { PageFileRecord } from './entities/page-file.entity';
import { CreatePageDto, UpdatePageDto } from './dto';

@Injectable()
export class PagesService {
  constructor(
    private readonly pagesRepository: PagesRepository,
    private readonly pageFilesRepository: PageFilesRepository,
    private readonly uploadService: UploadService,
  ) {}

  // --- Pages ---

  async findAll(): Promise<Page[]> {
    return this.pagesRepository.findAll();
  }

  async findBySlug(slug: string): Promise<Page> {
    const page = await this.pagesRepository.findBySlug(slug);
    if (!page) {
      throw new NotFoundException('Страница не найдена');
    }
    return page;
  }

  async findPublishedBySlug(slug: string): Promise<Page> {
    const page = await this.findBySlug(slug);
    if (!page.isPublished) {
      throw new NotFoundException('Страница не найдена');
    }
    return page;
  }

  async create(dto: CreatePageDto): Promise<Page> {
    const existing = await this.pagesRepository.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException(
        `Страница со slug "${dto.slug}" уже существует`,
      );
    }

    return this.pagesRepository.create({
      slug: dto.slug,
      title: dto.title,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      content: dto.content ?? {},
      isPublished: dto.isPublished ?? false,
    });
  }

  async update(slug: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.findBySlug(slug);

    if (dto.slug && dto.slug !== slug) {
      const conflicting = await this.pagesRepository.findBySlug(dto.slug);
      if (conflicting) {
        throw new ConflictException(
          `Страница со slug "${dto.slug}" уже существует`,
        );
      }
    }

    const updateData: Partial<Page> = {};
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.metaTitle !== undefined) updateData.metaTitle = dto.metaTitle;
    if (dto.metaDescription !== undefined)
      updateData.metaDescription = dto.metaDescription;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.isPublished !== undefined) updateData.isPublished = dto.isPublished;

    const updated = await this.pagesRepository.update(page.slug, updateData);
    if (!updated) {
      throw new NotFoundException('Страница не найдена');
    }
    return updated;
  }

  async delete(slug: string): Promise<void> {
    await this.findBySlug(slug);
    await this.pagesRepository.delete(slug);
  }

  // --- Global page files ---

  async listFiles(): Promise<PageFileRecord[]> {
    return this.pageFilesRepository.findAll();
  }

  async uploadFile(file: Express.Multer.File): Promise<PageFileRecord> {
    const uploaded = await this.uploadService.uploadRawFile(file, 'pages');

    return this.pageFilesRepository.create({
      key: uploaded.key,
      url: uploaded.url,
      name: file.originalname,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
    });
  }

  async deleteFile(key: string): Promise<void> {
    const record = await this.pageFilesRepository.findByKey(key);
    if (!record) {
      throw new NotFoundException('Файл не найден');
    }
    await this.uploadService.deleteFile(key);
    await this.pageFilesRepository.deleteByKey(key);
  }
}
