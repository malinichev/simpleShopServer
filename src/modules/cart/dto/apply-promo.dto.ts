import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ApplyPromoDto {
  @ApiProperty({ description: 'Промокод' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
