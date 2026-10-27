import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ProductImage,
  ProductVariant,
  ProductAttributes,
  ProductSEO,
} from '../entities/product.entity';
import { ProductStatus } from '../entities/product.entity';
import {
  ProductImageDto,
  ProductVariantDto,
  ProductAttributesDto,
  ProductSeoDto,
} from './create-product.dto';

class CategoryBriefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

// Выше ProductResponseDto: декоратор @ApiPropertyOptional({ type: [ColorSiblingDto] })
// исполняется при объявлении класса и не может ссылаться на класс, объявленный ниже (TDZ).
export class ColorSiblingDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  color?: string;

  @ApiPropertyOptional()
  colorHex?: string;

  @ApiPropertyOptional()
  image?: string;
}

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  shortDescription: string;

  @ApiProperty()
  sku: string;

  @ApiProperty()
  price: number;

  @ApiPropertyOptional()
  compareAtPrice?: number;

  @ApiProperty()
  categoryId: string;

  @ApiPropertyOptional({ type: CategoryBriefDto })
  category?: CategoryBriefDto;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: [ProductImageDto] })
  images: ProductImage[];

  @ApiProperty({ type: [ProductVariantDto] })
  variants: ProductVariant[];

  @ApiProperty({ type: ProductAttributesDto })
  attributes: ProductAttributes;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  reviewsCount: number;

  @ApiProperty()
  soldCount: number;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ type: ProductSeoDto })
  seo: ProductSEO;

  @ApiProperty()
  isVisible: boolean;

  @ApiPropertyOptional()
  color?: string;

  @ApiPropertyOptional()
  colorHex?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  modelId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  gtin?: string | null;

  // Явный type обязателен: без него design:type массива теряет тип элемента,
  // и свагер фолбэчится на string[].
  @ApiPropertyOptional({ type: [ColorSiblingDto] })
  colorSiblings?: ColorSiblingDto[];

  @ApiProperty({
    description: 'Требует кода маркировки Честный ЗНАК при отгрузке',
  })
  requiresMarking: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
