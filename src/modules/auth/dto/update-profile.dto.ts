import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Self-update эндпоинт PATCH /auth/me. Не позволяет менять email/password/role
 * через этот эндпоинт — для них есть отдельные защищённые flow:
 * - email → POST /auth/request-email-change (двухшаговый с подтверждением)
 * - password → POST /auth/change-password или /auth/set-password
 * - role → только admin через PATCH /users/:id
 */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ example: '+79001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatar?: string;
}
