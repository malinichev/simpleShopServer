import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SocialLinksDto {
  @ApiPropertyOptional({ example: 'https://instagram.com/store' })
  @IsOptional()
  @IsString()
  instagram?: string;

  @ApiPropertyOptional({ example: 'https://t.me/store' })
  @IsOptional()
  @IsString()
  telegram?: string;

  @ApiPropertyOptional({ example: 'https://vk.com/store' })
  @IsOptional()
  @IsString()
  vk?: string;
}

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

export class AiPromptPresetDto {
  @ApiPropertyOptional({ example: 'tea-before-sleep' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ example: 'Чай перед сном' })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    example: 'Evening wind-down: the model sits in a cozy bedroom…',
  })
  @IsString()
  prompt: string;
}

export class AiImagePromptsDto {
  @ApiPropertyOptional({ description: 'Базовый промпт стиля магазина' })
  @IsString()
  basePrompt: string;

  @ApiPropertyOptional({ type: [AiPromptPresetDto], maxItems: 12 })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AiPromptPresetDto)
  presets: AiPromptPresetDto[];
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'My Shop' })
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional({ example: 'admin@example.com' })
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

  @ApiPropertyOptional({ example: 'Стильная женская спортивная одежда' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'ru' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ type: SocialLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;

  @ApiPropertyOptional({ type: NotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsOptional()
  @IsEmail()
  notificationEmail?: string;

  @ApiPropertyOptional({
    description: 'Промпты ИИ-генерации фото: базовый стиль + пресеты сцен',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiImagePromptsDto)
  aiImagePrompts?: AiImagePromptsDto;
}
