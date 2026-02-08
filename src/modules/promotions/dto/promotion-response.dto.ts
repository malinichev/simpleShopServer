import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionType } from '../entities/promotion.entity';

export class PromotionResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: PromotionType })
  type: PromotionType;

  @ApiProperty()
  value: number;

  @ApiPropertyOptional()
  minOrderAmount?: number;

  @ApiPropertyOptional()
  maxDiscount?: number;

  @ApiPropertyOptional()
  usageLimit?: number;

  @ApiPropertyOptional()
  usageLimitPerUser?: number;

  @ApiProperty()
  usedCount: number;

  @ApiProperty({ type: [String] })
  categoryIds: string[];

  @ApiProperty({ type: [String] })
  productIds: string[];

  @ApiProperty({ type: [String] })
  excludeProductIds: string[];

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ValidatePromoResponseDto {
  @ApiProperty()
  valid: boolean;

  @ApiProperty()
  discount: number;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  type?: string;
}
