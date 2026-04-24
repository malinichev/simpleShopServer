import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export type OAuthStateMode = 'login' | 'link';

export interface OAuthStatePayload {
  mode: OAuthStateMode;
  userId?: string;
  redirectTo?: string;
  /** Для VK ID OAuth 2.1 (PKCE). Не используется для Yandex. */
  codeVerifier?: string;
  nonce: string;
}

export interface OAuthHandoffPayload {
  userId: string;
  /** одноразовый handoff token для передачи OAuth-сессии с backend-домена на frontend-домен */
  handoff: true;
  nonce: string;
}

@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

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
    } catch (err) {
      this.logger.warn(`OAuth state verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Недействительный OAuth state');
    }
  }

  async signHandoff(userId: string): Promise<string> {
    const secret = this.configService.get<string>('oauth.stateSecret');
    return this.jwtService.signAsync(
      { userId, handoff: true, nonce: this.randomNonce() },
      { secret, expiresIn: '30s' },
    );
  }

  async verifyHandoff(token: string): Promise<OAuthHandoffPayload> {
    const secret = this.configService.get<string>('oauth.stateSecret');
    try {
      const payload = await this.jwtService.verifyAsync<OAuthHandoffPayload>(
        token,
        { secret },
      );
      if (!payload.handoff || !payload.userId) {
        throw new Error('not a handoff token');
      }
      return payload;
    } catch (err) {
      this.logger.warn(
        `OAuth handoff verify failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Недействительный handoff token');
    }
  }

  private randomNonce(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
