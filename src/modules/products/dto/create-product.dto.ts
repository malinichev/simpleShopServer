import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  IsHexColor,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductStatus } from '../entities/product.entity';

export class ProductImageDto {
  @ApiProperty({ example: 'img-1' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'https://cdn.example.com/products/jacket-front.jpg' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({ example: 'Спортивная куртка — вид спереди' })
  @IsString()
  alt: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  order: number;
}

export class ProductVariantDto {
  @ApiProperty({ example: 'var-1' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'M' })
  @IsString()
  @IsNotEmpty()
  size: string;

  @ApiProperty({ example: 'Чёрный' })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiProperty({ example: '#000000' })
  @IsHexColor()
  colorHex: string;

  @ApiProperty({ example: 'JKT-BLK-M' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ example: 5990 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class ProductAttributesDto {
  @ApiProperty({ example: 'Полиэстер 90%, Эластан 10%' })
  @IsString()
  @IsNotEmpty()
  material: string;

  @ApiProperty({ example: ['бег', 'фитнес'] })
  @IsArray()
  @IsString({ each: true })
  activity: string[];

  @ApiProperty({ example: ['влагоотводящая', 'светоотражающие элементы'] })
  @IsArray()
  @IsString({ each: true })
  features: string[];

  @ApiPropertyOptional({ example: 'Машинная стирка при 30°C' })
  @IsOptional()
  @IsString()
  careInstructions?: string;
}

export class ProductSeoDto {
  @ApiProperty({ example: 'Спортивная куртка для бега' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Купить спортивную куртку для бега' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: ['куртка', 'бег', 'спорт'] })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'Спортивная куртка для бега' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'sportivnaya-kurtka-dlya-bega',
    description: 'Auto-generated from name if not provided',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ example: 'Лёгкая куртка из влагоотводящей ткани для комфортных пробежек.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Лёгкая куртка для бега' })
  @IsString()
  @IsNotEmpty()
  shortDescription: string;

  @ApiPropertyOptional({
    example: 'JKT-RUN-001',
    description: 'Auto-generated if not provided',
  })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 5990 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 7990 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({ example: ['бег', 'куртки', 'весна'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [ProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @ApiPropertyOptional({ type: [ProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiProperty({ type: ProductAttributesDto })
  @ValidateNested()
  @Type(() => ProductAttributesDto)
  attributes: ProductAttributesDto;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ type: ProductSeoDto })
  @ValidateNested()
  @Type(() => ProductSeoDto)
  seo: ProductSeoDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
