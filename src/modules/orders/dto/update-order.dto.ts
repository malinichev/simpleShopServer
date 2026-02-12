import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrderDto {
  @ApiPropertyOptional({ example: 'Клиент просил доставить до 18:00' })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
