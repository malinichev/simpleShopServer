import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SeoResponseDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String] })
  keywords: string[];
}

export class CategoryResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  image?: string;

  @ApiPropertyOptional()
  parentId?: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional({ type: SeoResponseDto })
  seo?: SeoResponseDto;

  @ApiPropertyOptional({ type: [CategoryResponseDto] })
  children?: CategoryResponseDto[];

  @ApiPropertyOptional()
  productsCount?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
