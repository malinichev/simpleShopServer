import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '@/modules/users/users.service';

export interface JwtRefreshPayload {
  sub: string;
  email: string;
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
          return request?.cookies?.refreshToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtRefreshPayload) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token не найден');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    // Прикрепляем refreshToken к запросу для использования в контроллере
    req['refreshTokenValue'] = refreshToken;

    return user;
  }
}
