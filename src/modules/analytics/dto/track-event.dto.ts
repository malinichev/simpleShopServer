import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';

export enum TrackEventType {
  PAGE_VIEW = 'pageView',
  ADD_TO_CART = 'addToCart',
  PURCHASE = 'purchase',
}

export class TrackEventDto {
  @ApiProperty({ enum: TrackEventType, description: 'Тип события' })
  @IsEnum(TrackEventType)
  type: TrackEventType;

  @ApiPropertyOptional({ description: 'ID сессии посетителя' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Источник трафика' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Устройство' })
  @IsOptional()
  @IsString()
  device?: string;

  @ApiPropertyOptional({ description: 'URL страницы' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Дополнительные данные' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
