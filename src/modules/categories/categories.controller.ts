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

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Получить все категории (плоский список)' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get('tree')
  @ApiOperation({ summary: 'Получить дерево категорий' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async findTree() {
    return this.categoriesService.findTree();
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Получить категорию по slug' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Получить категорию по ID' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async findById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
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
