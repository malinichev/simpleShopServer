import { ApiProperty } from '@nestjs/swagger';
import {
  OAuthProvider,
  UserOAuthIdentity,
} from '@/modules/users/entities/user-oauth-identity.entity';

export class OAuthIdentityDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: OAuthProvider })
  provider: OAuthProvider;

  @ApiProperty({ nullable: true })
  email: string | null;

  @ApiProperty()
  linkedAt: Date;

  static from(identity: UserOAuthIdentity): OAuthIdentityDto {
    return {
      id: identity.id,
      provider: identity.provider,
      email: identity.email ?? null,
      linkedAt: identity.createdAt,
    };
  }
}

export class AuthorizeUrlResponseDto {
  @ApiProperty({ example: 'https://id.vk.ru/authorize?...' })
  authorizeUrl: string;
}

export class LinkedResponseDto {
  @ApiProperty()
  identity: OAuthIdentityDto;
}
