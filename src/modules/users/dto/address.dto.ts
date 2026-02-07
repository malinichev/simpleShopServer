import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'Дом' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Иван' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Иванов' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '+79001234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Москва' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'ул. Пушкина' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: '10' })
  @IsString()
  @IsNotEmpty()
  building: string;

  @ApiPropertyOptional({ example: '25' })
  @IsOptional()
  @IsString()
  apartment?: string;

  @ApiProperty({ example: '101000' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class AddressResponseDto extends CreateAddressDto {
  @ApiProperty({ example: 'uuid-address-id' })
  id: string;

  @ApiProperty()
  declare isDefault: boolean;
}