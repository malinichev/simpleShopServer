import {
  IsString,
  IsUUID,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeImagesDto {
  @ApiProperty({ format: 'uuid', description: 'Товар' })
  @IsUUID()
  productId: string;

  @ApiProperty({
    type: [String],
    maxItems: 3,
    description: 'id фото из product.images для vision-анализа (1–3)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  imageIds: string[];
}
