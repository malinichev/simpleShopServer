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
import { PromotionsService } from './promotions.service';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  ValidatePromoDto,
  PromotionResponseDto,
  ValidatePromoResponseDto,
} from './dto';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить список всех промокодов (admin)' })
  @ApiResponse({ status: 200, type: [PromotionResponseDto] })
  async findAll() {
    return this.promotionsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить промокод по ID (admin)' })
  @ApiParam({ name: 'id', description: 'Promotion ID' })
  @ApiResponse({ status: 200, type: PromotionResponseDto })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async findById(@Param('id') id: string) {
    return this.promotionsService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Создать промокод (admin)' })
  @ApiResponse({ status: 201, type: PromotionResponseDto })
  @ApiResponse({ status: 409, description: 'Promo code already exists' })
  async create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить промокод (admin)' })
  @ApiParam({ name: 'id', description: 'Promotion ID' })
  @ApiResponse({ status: 200, type: PromotionResponseDto })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить промокод (admin)' })
  @ApiParam({ name: 'id', description: 'Promotion ID' })
  @ApiResponse({ status: 204, description: 'Promotion deleted' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.promotionsService.delete(id);
  }

  @Public()
  @Post('validate')
  @ApiOperation({ summary: 'Проверить промокод' })
  @ApiResponse({ status: 200, type: ValidatePromoResponseDto })
  async validate(
    @Body() dto: ValidatePromoDto,
    @CurrentUser('_id') userId?: string,
  ) {
    return this.promotionsService.validate(
      dto.code,
      userId || null,
      { cartTotal: dto.cartTotal, items: dto.items },
    );
  }
}
