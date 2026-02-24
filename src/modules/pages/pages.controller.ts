import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { PagesService } from './pages.service';
import {
  CreatePageDto,
  UpdatePageDto,
  PageResponseDto,
  PagePublicResponseDto,
} from './dto';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('pages')
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить список всех страниц (admin)' })
  @ApiResponse({ status: 200, type: [PageResponseDto] })
  async findAll() {
    return this.pagesService.findAll();
  }

  @Get('admin/:slug')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить страницу по slug (admin, полные данные)' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiResponse({ status: 200, type: PageResponseDto })
  @ApiResponse({ status: 404, description: 'Page not found' })
  async findOne(@Param('slug') slug: string) {
    return this.pagesService.findBySlug(slug);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Получить публичную страницу по slug' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiResponse({ status: 200, type: PagePublicResponseDto })
  @ApiResponse({ status: 404, description: 'Page not found or not published' })
  async findPublic(@Param('slug') slug: string): Promise<PagePublicResponseDto> {
    const page = await this.pagesService.findPublishedBySlug(slug);
    return {
      slug: page.slug,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      content: page.content,
      isPublished: page.isPublished,
    };
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Создать страницу (admin)' })
  @ApiResponse({ status: 201, type: PageResponseDto })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async create(@Body() dto: CreatePageDto) {
    return this.pagesService.create(dto);
  }

  @Patch(':slug')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить страницу (admin)' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiResponse({ status: 200, type: PageResponseDto })
  @ApiResponse({ status: 404, description: 'Page not found' })
  async update(@Param('slug') slug: string, @Body() dto: UpdatePageDto) {
    return this.pagesService.update(slug, dto);
  }

  @Delete(':slug')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить страницу (admin)' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiResponse({ status: 204, description: 'Page deleted' })
  @ApiResponse({ status: 404, description: 'Page not found' })
  async delete(@Param('slug') slug: string): Promise<void> {
    await this.pagesService.delete(slug);
  }

  @Post(':slug/files')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить файл для страницы (admin)' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: PageResponseDto })
  async uploadFile(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }
    return this.pagesService.addFile(slug, file);
  }

  @Delete(':slug/files')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Удалить файл страницы из S3 и из списка (admin)' })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiQuery({ name: 'key', description: 'S3 file key', required: true })
  @ApiResponse({ status: 200, type: PageResponseDto })
  @ApiResponse({ status: 404, description: 'Page or file not found' })
  async deleteFile(
    @Param('slug') slug: string,
    @Query('key') key: string,
  ) {
    if (!key) {
      throw new BadRequestException('Ключ файла не указан');
    }
    return this.pagesService.removeFile(slug, key);
  }
}
