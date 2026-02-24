import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PagesRepository } from './pages.repository';
import { UploadService } from '@/modules/upload/upload.service';
import { Page, PageFile } from './entities/page.entity';
import { CreatePageDto, UpdatePageDto } from './dto';

@Injectable()
export class PagesService {
  constructor(
    private readonly pagesRepository: PagesRepository,
    private readonly uploadService: UploadService,
  ) {}

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
      throw new ConflictException(`Страница со slug "${dto.slug}" уже существует`);
    }

    return this.pagesRepository.create({
      slug: dto.slug,
      title: dto.title,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      content: dto.content ?? {},
      files: [],
      isPublished: dto.isPublished ?? false,
    });
  }

  async update(slug: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.findBySlug(slug);

    if (dto.slug && dto.slug !== slug) {
      const conflicting = await this.pagesRepository.findBySlug(dto.slug);
      if (conflicting) {
        throw new ConflictException(`Страница со slug "${dto.slug}" уже существует`);
      }
    }

    const updateData: Partial<Page> = {};
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.metaTitle !== undefined) updateData.metaTitle = dto.metaTitle;
    if (dto.metaDescription !== undefined) updateData.metaDescription = dto.metaDescription;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.isPublished !== undefined) updateData.isPublished = dto.isPublished;

    const updated = await this.pagesRepository.update(page.slug, updateData);
    if (!updated) {
      throw new NotFoundException('Страница не найдена');
    }
    return updated;
  }

  async delete(slug: string): Promise<void> {
    const page = await this.findBySlug(slug);

    // Delete all associated files from S3
    if (page.files.length > 0) {
      await Promise.allSettled(
        page.files.map((file) => this.uploadService.deleteFile(file.key)),
      );
    }

    await this.pagesRepository.delete(slug);
  }

  async addFile(slug: string, file: Express.Multer.File): Promise<Page> {
    const page = await this.findBySlug(slug);

    const uploaded = await this.uploadService.uploadRawFile(
      file,
      `pages/${slug}`,
    );

    const pageFile: PageFile = {
      key: uploaded.key,
      url: uploaded.url,
      name: file.originalname,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
      uploadedAt: new Date(),
    };

    const updatedFiles = [...(page.files ?? []), pageFile];
    const updated = await this.pagesRepository.update(slug, { files: updatedFiles });
    if (!updated) {
      throw new NotFoundException('Страница не найдена');
    }
    return updated;
  }

  async removeFile(slug: string, key: string): Promise<Page> {
    const page = await this.findBySlug(slug);

    const fileExists = page.files.some((f) => f.key === key);
    if (!fileExists) {
      throw new NotFoundException('Файл не найден в списке страницы');
    }

    await this.uploadService.deleteFile(key);

    const updatedFiles = page.files.filter((f) => f.key !== key);
    const updated = await this.pagesRepository.update(slug, { files: updatedFiles });
    if (!updated) {
      throw new NotFoundException('Страница не найдена');
    }
    return updated;
  }
}
