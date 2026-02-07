import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ description: 'Refresh token (также устанавливается в HTTP-only cookie)' })
  refreshToken: string;
}
