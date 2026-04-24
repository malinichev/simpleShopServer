import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProfileDto } from './oauth-profile.dto';
import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';

const VK_ID_AUTHORIZE_URL = 'https://id.vk.ru/authorize';
const VK_ID_TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
const VK_ID_USER_INFO_URL = 'https://id.vk.ru/oauth2/user_info';

/**
 * VK ID режет не-алфавитные символы из state (экспериментально подтверждено:
 * стирает и `.`, и `~`, оставляет только base64url-алфавит [A-Za-z0-9-_]).
 * Оборачиваем весь JWT в base64url — он выживает.
 */
function encodeState(state: string): string {
  return Buffer.from(state, 'utf8').toString('base64url');
}

function decodeState(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

export interface VkIdTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  userId?: string;
}

interface VkIdUserInfo {
  user_id?: string | number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  verified?: boolean;
}

@Injectable()
export class VkIdOAuthService {
  private readonly logger = new Logger(VkIdOAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  buildAuthorizeUrl(params: {
    state: string;
    codeChallenge: string;
    scope?: string;
  }): string {
    const clientId = this.clientId();
    const redirectUri = this.redirectUri();

    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: params.scope ?? 'email',
      /**
       * VK ID стирает точки из state (видимо, считая их path-traversal).
       * Заменяем `.` на `~` — символ не из алфавита JWT base64url.
       * Восстанавливаем обратно в callback через decodeState().
       */
      state: encodeState(params.state),
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${VK_ID_AUTHORIZE_URL}?${qs.toString()}`;
  }

  decodeState(raw: string): string {
    return decodeState(raw);
  }

  async exchangeCode(
    code: string,
    deviceId: string,
    codeVerifier: string,
  ): Promise<VkIdTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      device_id: deviceId,
      redirect_uri: this.redirectUri(),
      client_id: this.clientId(),
    });

    const res = await fetch(VK_ID_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok || typeof json.access_token !== 'string') {
      this.logger.warn(
        `VK ID token exchange failed: status=${res.status} error=${JSON.stringify(json)}`,
      );
      throw new UnauthorizedException('VK ID token exchange failed');
    }

    return {
      accessToken: json.access_token,
      refreshToken:
        typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
      idToken: typeof json.id_token === 'string' ? json.id_token : undefined,
      expiresIn:
        typeof json.expires_in === 'number' ? json.expires_in : undefined,
      userId:
        typeof json.user_id === 'string' || typeof json.user_id === 'number'
          ? String(json.user_id)
          : undefined,
    };
  }

  async fetchUserInfo(accessToken: string): Promise<OAuthProfileDto> {
    const body = new URLSearchParams({
      client_id: this.clientId(),
      access_token: accessToken,
    });

    const res = await fetch(VK_ID_USER_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const json = (await res.json()) as { user?: VkIdUserInfo } & VkIdUserInfo;

    if (!res.ok) {
      this.logger.warn(
        `VK ID user_info failed: status=${res.status} error=${JSON.stringify(json)}`,
      );
      throw new InternalServerErrorException('VK ID user_info failed');
    }

    const user: VkIdUserInfo = json.user ?? json;
    if (!user.user_id) {
      throw new InternalServerErrorException(
        'VK ID вернул профиль без user_id',
      );
    }

    return {
      provider: OAuthProvider.VK,
      providerId: String(user.user_id),
      email: user.email ?? null,
      /**
       * VK ID не гарантирует верификацию email — оставляем false,
       * чтобы по email-конфликту не автолинковать к password-юзеру.
       */
      emailVerified: false,
      firstName: user.first_name,
      lastName: user.last_name,
      avatar: user.avatar,
      raw: user as unknown as Record<string, unknown>,
    };
  }

  private clientId(): string {
    const id = this.configService.get<string>('oauth.vk.clientId');
    if (!id) {
      throw new InternalServerErrorException('VK_CLIENT_ID не задан');
    }
    return id;
  }

  private redirectUri(): string {
    const uri = this.configService.get<string>('oauth.vk.callbackUrl');
    if (!uri) {
      throw new InternalServerErrorException('VK_CALLBACK_URL не задан');
    }
    return uri;
  }
}
