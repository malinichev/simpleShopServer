import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class NotificationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  statusChange?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentReceived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newReview?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  customerRegistration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundRequest?: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'SportShop' })
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional({ example: 'admin@sportshop.ru' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+7 (999) 123-45-67' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Москва, ул. Примерная, д. 1' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'RUB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'ru' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ type: NotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @ApiPropertyOptional({ example: 'admin@sportshop.ru' })
  @IsOptional()
  @IsEmail()
  notificationEmail?: string;
}
