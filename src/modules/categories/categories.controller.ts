import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';
import { isAdminViewer, OptionalViewerUser } from '@/common/helpers/admin-viewer.helper';
import { OptionalJwtAuthGuard } from '@/modules/cart/guards/optional-jwt-auth.guard';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Публичные эндпоинты: неактивные категории видны только админам из панели
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @ApiOperation({
    summary: 'Получить все категории (плоский список; не-админам — только активные)',
  })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll(@Req() req: { user?: OptionalViewerUser }) {
    return this.categoriesService.findAll({
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('tree')
  @ApiOperation({
    summary: 'Получить дерево категорий (не-админам — только активные)',
  })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findTree(@Req() req: { user?: OptionalViewerUser }) {
    return this.categoriesService.findTree({
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Получить категорию по slug (не-админам — только активные)',
  })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async findBySlug(@Param('slug') slug: string, @Req() req: { user?: OptionalViewerUser }) {
    return this.categoriesService.findBySlug(slug, {
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Получить категорию по ID (не-админам — только активные)',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async findById(@Param('id') id: string, @Req() req: { user?: OptionalViewerUser }) {
    return this.categoriesService.findById(id, {
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Создать категорию (admin)' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch('reorder')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Изменить порядок категорий (admin)' })
  async reorder(@Body() dto: ReorderCategoriesDto): Promise<void> {
    return this.categoriesService.reorder(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить категорию (admin)' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить категорию (admin)' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.categoriesService.delete(id);
  }
}
