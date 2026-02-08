import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({ description: 'Количество (0 для удаления)', minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  quantity: number;
}
