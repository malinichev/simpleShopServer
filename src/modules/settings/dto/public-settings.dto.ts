import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SocialLinksDto } from './update-settings.dto';

/**
 * Форма ответа GET /settings/public (settings.service.getPublicSettings).
 * Только публичные поля: без SMTP/платёжных конфигов и email-уведомлений.
 */
export class PublicSettingsDto {
  @ApiProperty({ example: 'svoybrand' })
  storeName: string;

  @ApiProperty({ example: 'Женская спортивная одежда' })
  description: string;

  @ApiPropertyOptional({ example: 'shop@svoybrand.shop' })
  email?: string;

  @ApiPropertyOptional({ example: '+7 (900) 000-00-00' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Москва' })
  address?: string;

  @ApiProperty({ example: 'RUB' })
  currency: string;

  @ApiPropertyOptional({ type: SocialLinksDto })
  socialLinks?: SocialLinksDto;

  @ApiProperty({
    type: [String],
    example: ['vk', 'yandex'],
    description: 'OAuth-провайдеры, включённые env-переменными',
  })
  enabledOAuthProviders: string[];

  @ApiProperty({
    type: [String],
    example: ['manual', 'yookassa'],
    description: 'Платёжные провайдеры, включённые env-переменными',
  })
  enabledPaymentProviders: string[];
}
