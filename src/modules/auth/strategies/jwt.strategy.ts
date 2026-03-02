import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { UserRole } from '@/modules/users/entities/user.entity';
import { TokenAudience, UserWithTokenAudience } from '@/common/types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  aud: TokenAudience;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    // Attach token audience to user object for downstream use
    (user as UserWithTokenAudience).__tokenAudience =
      payload.aud || TokenAudience.WEB;

    return user;
  }
}
