import {
  IsString,
  IsUUID,
  IsArray,
  IsOptional,
  IsIn,
  IsNotEmpty,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartImageRegenDto {
  @ApiProperty({ format: 'uuid', description: 'Товар' })
  @IsUUID()
  productId: string;

  @ApiProperty({
    type: [String],
    maxItems: 10,
    description: 'id фото из product.images, которые нужно перегенерировать',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  imageIds: string[];

  @ApiProperty({
    minLength: 10,
    maxLength: 4000,
    description: 'Промпт сцены (что должно быть на фото)',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  prompt: string;

  @ApiPropertyOptional({
    enum: [1, 2],
    default: 1,
    description: 'Сколько вариантов генерировать на каждое фото',
  })
  @IsOptional()
  @IsIn([1, 2])
  variantsPerImage?: number;
}
