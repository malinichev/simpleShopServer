import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenAudience } from '@/common/types';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Некорректный email адрес' })
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  password: string;

  @ApiPropertyOptional({
    enum: TokenAudience,
    example: TokenAudience.WEB,
    description: 'Тип клиентского приложения. Определяет audience токена.',
  })
  @IsOptional()
  @IsEnum(TokenAudience)
  client?: TokenAudience;
}
