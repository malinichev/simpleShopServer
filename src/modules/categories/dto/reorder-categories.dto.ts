import { IsArray, ValidateNested, IsString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReorderItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  id: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  order: number;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [ReorderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
