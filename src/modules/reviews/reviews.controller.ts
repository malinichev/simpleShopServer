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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewDto,
  UpdateReviewDto,
  AdminReplyDto,
  ReviewQueryDto,
  ReviewResponseDto,
} from './dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { User, UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // === Public: отзывы товара ===

  @Public()
  @Get('products/:productId/reviews')
  @ApiOperation({ summary: 'Получить отзывы товара (только одобренные)' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Paginated list of approved reviews' })
  async findByProduct(
    @Param('productId') productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewsService.findByProduct(productId, query);
  }

  // === Auth: создание отзыва ===

  @Post('products/:productId/reviews')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Создать отзыв на товар (customer)' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or product not in order' })
  @ApiResponse({ status: 409, description: 'Review already exists' })
  async create(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user._id.toString(), productId, dto);
  }

  // === Admin: все отзывы ===

  @Get('reviews')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить все отзывы (admin)' })
  @ApiResponse({ status: 200, description: 'Paginated list of all reviews' })
  async findAll(@Query() query: ReviewQueryDto) {
    return this.reviewsService.findAll(query);
  }

  // === Admin/Owner: отзыв по ID ===

  @Get('reviews/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить отзыв по ID (admin/owner)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async findById(@Param('id') id: string) {
    return this.reviewsService.findById(id);
  }

  // === Owner: обновление ===

  @Patch('reviews/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить отзыв (owner)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({ status: 403, description: 'Not allowed' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(id, user._id.toString(), dto);
  }

  // === Admin/Owner: удаление ===

  @Delete('reviews/:id')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить отзыв (admin/owner)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 204, description: 'Review deleted' })
  @ApiResponse({ status: 403, description: 'Not allowed' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    const isAdmin = user.role === UserRole.ADMIN;
    await this.reviewsService.delete(id, user._id.toString(), isAdmin);
  }

  // === Admin: одобрение ===

  @Patch('reviews/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Одобрить отзыв (admin)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async approve(@Param('id') id: string) {
    return this.reviewsService.approve(id);
  }

  // === Admin: ответ ===

  @Post('reviews/:id/reply')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Ответить на отзыв (admin)' })
  @ApiParam({ name: 'id', description: 'Review ID' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async addReply(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AdminReplyDto,
  ) {
    return this.reviewsService.addReply(id, user._id.toString(), dto.text);
  }
}
