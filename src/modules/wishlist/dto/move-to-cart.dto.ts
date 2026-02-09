import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class MoveToCartDto {
  @ApiProperty({ description: 'ID товара' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'ID варианта товара' })
  @IsString()
  @IsNotEmpty()
  variantId: string;
}
