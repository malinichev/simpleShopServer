import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Некорректный email адрес' })
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 50 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' })
  @MaxLength(50, { message: 'Пароль должен содержать максимум 50 символов' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, {
    message: 'Пароль должен содержать заглавные и строчные буквы, цифры и спецсимволы',
  })
  password: string;

  @ApiProperty({ example: 'Иван', minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2, { message: 'Имя должно содержать минимум 2 символа' })
  @MaxLength(50, { message: 'Имя должно содержать максимум 50 символов' })
  firstName: string;

  @ApiProperty({ example: 'Иванов', minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2, { message: 'Фамилия должна содержать минимум 2 символа' })
  @MaxLength(50, { message: 'Фамилия должна содержать максимум 50 символов' })
  lastName: string;

  @ApiPropertyOptional({ example: '+79001234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Некорректный формат номера телефона',
  })
  phone?: string;
}
