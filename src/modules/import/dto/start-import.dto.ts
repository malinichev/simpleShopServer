import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@/modules/products/entities/product.entity';

export class StartImportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @ApiProperty()
  @IsObject()
  mapping: Record<string, string>;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsOptional()
  @IsEnum(ProductStatus)
  defaultStatus?: ProductStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean;

  @ApiPropertyOptional({
    description: 'Duplicate resolutions: product.id → "db" | "csv"',
  })
  @IsOptional()
  @IsObject()
  duplicateResolutions?: Record<string, 'db' | 'csv'>;
}
