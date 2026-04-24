import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, YandexProfile, VerifyCallback } from 'passport-yandex';
import { OAuthProfileDto } from '../oauth-profile.dto';
import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';

@Injectable()
export class YandexStrategy extends PassportStrategy(Strategy, 'yandex') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('oauth.yandex.clientId') || '',
      clientSecret:
        configService.get<string>('oauth.yandex.clientSecret') || '',
      callbackURL: configService.get<string>('oauth.yandex.callbackUrl') || '',
      state: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: YandexProfile,
    done: VerifyCallback,
  ): void {
    try {
      const json = profile._json as
        | {
            default_email?: string;
            first_name?: string;
            last_name?: string;
            default_avatar_id?: string;
          }
        | undefined;

      const email = json?.default_email || profile.emails?.[0]?.value || null;

      const avatar = json?.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${json.default_avatar_id}/islands-200`
        : profile.photos?.[0]?.value;

      const dto: OAuthProfileDto = {
        provider: OAuthProvider.YANDEX,
        providerId: profile.id,
        email,
        emailVerified: Boolean(email),
        firstName: json?.first_name ?? profile.name?.givenName,
        lastName: json?.last_name ?? profile.name?.familyName,
        avatar,
        raw: { id: profile.id, displayName: profile.displayName },
      };
      done(null, dto);
    } catch (err) {
      done(err as Error);
    }
  }
}
