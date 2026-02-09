import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsArray,
  IsUrl,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Order ID confirming purchase' })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({ description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Review title', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({ description: 'Review text', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text: string;

  @ApiPropertyOptional({ description: 'Image URLs (max 5)', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  images?: string[];
}
