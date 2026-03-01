import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '@/modules/users/users.service';
import { TokenAudience } from '@/common/types';

export interface JwtRefreshPayload {
  sub: string;
  email: string;
  aud: TokenAudience;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Try admin cookie first, then web cookie
          return request?.cookies?.refreshToken_admin || request?.cookies?.refreshToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtRefreshPayload) {
    // Determine which cookie was used based on payload audience
    const audience = payload.aud || TokenAudience.WEB;
    const cookieName = audience === TokenAudience.ADMIN_PANEL ? 'refreshToken_admin' : 'refreshToken';
    const refreshToken = req.cookies?.[cookieName];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token не найден');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    // Attach refreshToken and audience to request for use in controller
    req['refreshTokenValue'] = refreshToken;
    req['tokenAudience'] = audience;

    return user;
  }
}
