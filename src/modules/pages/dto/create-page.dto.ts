import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsObject,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePageDto {
  @ApiProperty({
    description: 'URL-safe slug (lowercase letters, digits, hyphens)',
    example: 'about',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase letters, digits and hyphens' })
  slug: string;

  @ApiProperty({ description: 'Display name in admin', example: 'О нас' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Meta title for SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'Meta description for SEO' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON content', additionalProperties: true })
  @IsOptional()
  @IsObject()
  content?: object;

  @ApiPropertyOptional({ description: 'Whether the page is publicly visible', default: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
