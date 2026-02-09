import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateReviewDto {
  @ApiPropertyOptional({ description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Review title', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Review text', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string;
}
