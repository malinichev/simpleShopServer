import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ShippingAddressDto {
  @ApiProperty({ example: 'Мария' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Иванова' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '+79991234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Москва' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'ул. Ленина' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: '10' })
  @IsString()
  @IsNotEmpty()
  building: string;

  @ApiPropertyOptional({ example: '42' })
  @IsOptional()
  @IsString()
  apartment?: string;

  @ApiProperty({ example: '101000' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    example: 'addr-1',
    description: 'ID сохранённого адреса пользователя. Если указан, shippingAddress игнорируется',
  })
  @IsOptional()
  @IsString()
  shippingAddressId?: string;

  @ApiPropertyOptional({
    type: ShippingAddressDto,
    description: 'Новый адрес доставки. Используется, если shippingAddressId не указан',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @ApiProperty({ example: 'courier', description: 'Способ доставки' })
  @IsString()
  @IsNotEmpty()
  shippingMethod: string;

  @ApiProperty({ example: 'card', description: 'Способ оплаты' })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiPropertyOptional({ example: 'Позвонить за час до доставки' })
  @IsOptional()
  @IsString()
  customerNote?: string;

  @ApiPropertyOptional({ example: 'SUMMER2024' })
  @IsOptional()
  @IsString()
  promoCode?: string;
}
