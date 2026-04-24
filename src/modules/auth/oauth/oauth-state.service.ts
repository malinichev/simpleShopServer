import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export type OAuthStateMode = 'login' | 'link';

export interface OAuthStatePayload {
  mode: OAuthStateMode;
  userId?: string;
  redirectTo?: string;
  nonce: string;
}

@Injectable()
export class OAuthStateService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async sign(payload: Omit<OAuthStatePayload, 'nonce'>): Promise<string> {
    const secret = this.configService.get<string>('oauth.stateSecret');
    const expiresIn = this.configService.get<string>('oauth.stateExpiresIn');
    return this.jwtService.signAsync(
      { ...payload, nonce: this.randomNonce() },
      { secret, expiresIn },
    );
  }

  async verify(token: string): Promise<OAuthStatePayload> {
    const secret = this.configService.get<string>('oauth.stateSecret');
    try {
      return await this.jwtService.verifyAsync<OAuthStatePayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Недействительный OAuth state');
    }
  }

  private randomNonce(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
