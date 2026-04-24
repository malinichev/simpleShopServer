import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailChangeDto {
  @ApiProperty({ example: 'new@example.com' })
  @IsEmail()
  newEmail: string;

  @ApiProperty({ example: 'CurrentPassword123!' })
  @IsString()
  @MinLength(1)
  currentPassword: string;
}

export class ConfirmEmailChangeDto {
  @ApiProperty()
  @IsString()
  token: string;
}
