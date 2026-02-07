import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123token' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' })
  @MaxLength(50, { message: 'Пароль должен содержать максимум 50 символов' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, {
    message: 'Пароль должен содержать заглавные и строчные буквы, цифры и спецсимволы',
  })
  password: string;
}
