import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsDateString } from 'class-validator';

export enum Granularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Начало периода (ISO date)', example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Конец периода (ISO date)', example: '2025-01-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: Granularity, default: Granularity.DAY, description: 'Гранулярность данных' })
  @IsOptional()
  @IsEnum(Granularity)
  granularity?: Granularity = Granularity.DAY;
}
