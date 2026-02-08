import { IsArray, IsEnum, IsString, IsNumber, ArrayMinSize, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '../entities/product.entity';

export class BulkDeleteDto {
  @ApiProperty({ example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];
}

export class BulkUpdateStatusDto {
  @ApiProperty({ example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ enum: ProductStatus, example: ProductStatus.ACTIVE })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}

export class UpdateStockDto {
  @ApiProperty({ example: 'var-1' })
  @IsString()
  variantId: string;

  @ApiProperty({ example: 25 })
  @IsNumber()
  @Min(0)
  stock: number;
}
