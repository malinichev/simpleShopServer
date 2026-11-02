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
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  ColorSiblingDto,
  BulkDeleteDto,
  BulkUpdateStatusDto,
  UpdateStockDto,
  ProductFacetsDto,
} from './dto';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';
import { ApiPaginatedResponse } from '@/common/decorators/api-paginated-response.decorator';
import { isAdminViewer, OptionalViewerUser } from '@/common/helpers/admin-viewer.helper';
import { OptionalJwtAuthGuard } from '@/modules/cart/guards/optional-jwt-auth.guard';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // Публичные каталог-эндпоинты: черновики/скрытые товары видны только
  // админам из панели (OptionalJwtAuthGuard заполняет req.user, если токен есть).
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @ApiOperation({
    summary:
      'Получить список товаров с фильтрацией и пагинацией (не-админам — только active и видимые)',
  })
  @ApiPaginatedResponse(ProductResponseDto)
  async findAll(@Query() query: ProductQueryDto, @Req() req: { user?: OptionalViewerUser }) {
    return this.productsService.findAll(query, {
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Public()
  @Get('facets')
  @ApiOperation({
    summary:
      'Фасеты каталога: доступные цвета/размеры/активности и диапазон цен',
  })
  @ApiResponse({ status: 200, type: ProductFacetsDto })
  async getFacets(@Query() query: ProductQueryDto): Promise<ProductFacetsDto> {
    return this.productsService.getFacets(query);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Поиск товаров по названию/описанию' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', description: 'Max results', required: false })
  @ApiResponse({ status: 200, type: [ProductResponseDto] })
  async search(@Query('q') q: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.productsService.search(q, parsedLimit);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Получить товар по slug (не-админам — только active и видимые)',
  })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findBySlug(@Param('slug') slug: string, @Req() req: { user?: OptionalViewerUser }) {
    return this.productsService.findBySlug(slug, {
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Получить товар по ID (не-админам — только active и видимые)',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findById(@Param('id') id: string, @Req() req: { user?: OptionalViewerUser }) {
    return this.productsService.findById(id, {
      includeHidden: isAdminViewer(req.user),
    });
  }

  @Public()
  @Get(':id/siblings')
  @ApiOperation({ summary: 'Получить цветовые сиблинги товара' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiOkResponse({ type: [ColorSiblingDto] })
  async findColorSiblings(@Param('id') id: string) {
    return this.productsService.findColorSiblings(id);
  }

  @Public()
  @Get(':id/related')
  @ApiOperation({ summary: 'Получить похожие товары' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max results (default 8)',
  })
  @ApiResponse({ status: 200, type: [ProductResponseDto] })
  async findRelated(@Param('id') id: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 8;
    return this.productsService.findRelated(id, parsedLimit);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Создать товар (admin)' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  @ApiResponse({ status: 409, description: 'Slug or SKU already exists' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить товар (admin)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить товар (admin)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.productsService.delete(id);
  }

  @Post('bulk-delete')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Массовое удаление товаров (admin)' })
  @ApiResponse({ status: 204, description: 'Products deleted' })
  async bulkDelete(@Body() dto: BulkDeleteDto): Promise<void> {
    await this.productsService.bulkDelete(dto.ids);
  }

  @Post('bulk-status')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Массовое изменение статуса товаров (admin)' })
  @ApiResponse({ status: 204, description: 'Status updated' })
  async bulkUpdateStatus(@Body() dto: BulkUpdateStatusDto): Promise<void> {
    await this.productsService.bulkUpdateStatus(dto.ids, dto.status);
  }

  @Patch(':id/stock')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить остатки варианта товара (admin/manager)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 400, description: 'Variant not found' })
  async updateStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    const product = await this.productsService.findById(id);
    if (product.requiresMarking) {
      throw new BadRequestException(
        'Для маркированных товаров stock управляется автоматически через коды маркировки',
      );
    }
    return this.productsService.updateStock(id, dto.variantId, dto.stock);
  }
}
