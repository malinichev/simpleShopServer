import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientErrorDto {
  @ApiProperty({ description: 'Сообщение ошибки (error.message)' })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Стектрейс (обрезается)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @ApiPropertyOptional({ description: 'digest из Next.js error boundary' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  digest?: string;

  @ApiPropertyOptional({ description: 'Маршрут, где произошла ошибка' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  route?: string;

  @ApiPropertyOptional({ description: 'User-Agent браузера' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @ApiPropertyOptional({ enum: ['error', 'warn'] })
  @IsOptional()
  @IsIn(['error', 'warn'])
  level?: 'error' | 'warn';
}
