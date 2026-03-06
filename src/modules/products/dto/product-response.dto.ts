import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ProductImage,
  ProductVariant,
  ProductAttributes,
  ProductSEO,
} from '../entities/product.entity';
import { ProductStatus } from '../entities/product.entity';

class CategoryBriefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
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

  @ApiProperty({ type: [Object] })
  images: ProductImage[];

  @ApiProperty({ type: [Object] })
  variants: ProductVariant[];

  @ApiProperty({ type: () => Object })
  attributes: ProductAttributes;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  reviewsCount: number;

  @ApiProperty()
  soldCount: number;

  @ApiProperty({ enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ type: () => Object })
  seo: ProductSEO;

  @ApiProperty()
  isVisible: boolean;

  @ApiPropertyOptional()
  color?: string;

  @ApiPropertyOptional()
  colorHex?: string;

  @ApiPropertyOptional()
  modelId?: string | null;

  @ApiPropertyOptional()
  colorSiblings?: ColorSiblingDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

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
