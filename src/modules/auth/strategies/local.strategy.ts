import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { TokenAudience } from '@/common/types';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, email: string, password: string) {
    const user = await this.authService.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const body = req.body as Record<string, unknown> | undefined;
    const client = body?.client as TokenAudience | undefined;
    (req as unknown as Record<string, unknown>)['tokenAudience'] =
      client || TokenAudience.WEB;

    return user;
  }
}
