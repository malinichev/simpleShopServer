import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsNotEmpty,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider } from '../entities/payment-method.entity';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Банковская карта' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Visa, Mastercard, МИР' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    enum: PaymentProvider,
    default: PaymentProvider.MANUAL,
    description:
      'Провайдер: manual (default — оплата вне системы) | yookassa | stripe | cloudpayments',
  })
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    description: 'Provider-specific config (например, yookassa receipt-template)',
  })
  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>;
}
