import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionType } from '../entities/promotion.entity';

export class CreatePromotionDto {
  @ApiProperty({ example: 'SUMMER2024' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Летняя распродажа' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Скидка 15% на всё до конца лета' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PromotionType, example: PromotionType.PERCENTAGE })
  @IsEnum(PromotionType)
  type: PromotionType;

  @ApiProperty({ example: 15, description: 'Процент скидки или фиксированная сумма' })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ example: 3000, description: 'Минимальная сумма заказа' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Максимальная сумма скидки (для процентных)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number;

  @ApiPropertyOptional({ example: 100, description: 'Общий лимит использований' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ example: 1, description: 'Лимит использований на пользователя' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimitPerUser?: number;

  @ApiPropertyOptional({
    example: ['507f1f77bcf86cd799439011'],
    description: 'ID категорий, к которым применяется промокод',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    example: ['507f1f77bcf86cd799439012'],
    description: 'ID товаров, к которым применяется промокод',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional({
    example: ['507f1f77bcf86cd799439013'],
    description: 'ID товаров, исключённых из промокода',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeProductIds?: string[];

  @ApiProperty({ example: '2024-06-01T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-08-31T23:59:59.000Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
