import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CartItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439012' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 5990 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class ValidatePromoDto {
  @ApiProperty({ example: 'SUMMER2024' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @Min(0)
  cartTotal: number;

  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}

export interface CartValidationData {
  cartTotal: number;
  items: CartItemDto[];
}

export interface PromotionValidation {
  valid: boolean;
  discount: number;
  message?: string;
  type?: string;
}
