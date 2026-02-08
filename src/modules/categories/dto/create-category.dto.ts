import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SeoDto {
  @ApiProperty({ example: 'Спортивная одежда' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Купить спортивную одежду для женщин' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: ['спорт', 'одежда', 'женская'] })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Спортивная одежда' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'sportivnaya-odezhda',
    description: 'Auto-generated from name if not provided',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'Категория спортивной одежды для женщин' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/categories/sport.jpg' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: SeoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;
}
