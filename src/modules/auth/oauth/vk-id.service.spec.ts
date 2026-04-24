import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { VkIdOAuthService } from './vk-id.service';
import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';

describe('VkIdOAuthService', () => {
  let service: VkIdOAuthService;
  let fetchMock: jest.Mock;

  const configValues: Record<string, string> = {
    'oauth.vk.clientId': '54561856',
    'oauth.vk.callbackUrl': 'http://localhost:4000/api/auth/vk/callback',
  };

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VkIdOAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configValues[key],
          },
        },
      ],
    }).compile();

    service = module.get(VkIdOAuthService);
  });

  describe('buildAuthorizeUrl', () => {
    it('строит URL к id.vk.ru/authorize с PKCE, state в base64url', () => {
      const url = service.buildAuthorizeUrl({
        state: 'my.state.jwt',
        codeChallenge: 'abc123',
      });
      expect(url).toContain('https://id.vk.ru/authorize?');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=54561856');
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(configValues['oauth.vk.callbackUrl'])}`,
      );
      expect(url).toContain('code_challenge=abc123');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('scope=email');
      // state — base64url-wrapped (VK ID стирает символы вне base64url алфавита)
      const expectedState = Buffer.from('my.state.jwt', 'utf8').toString(
        'base64url',
      );
      expect(url).toContain(`state=${expectedState}`);
      expect(url).not.toContain('state=my.state.jwt');
    });

    it('decodeState восстанавливает оригинал', () => {
      const original = 'my.state.jwt';
      const encoded = Buffer.from(original, 'utf8').toString('base64url');
      expect(service.decodeState(encoded)).toBe(original);
    });
  });

  describe('exchangeCode', () => {
    it('POSTит form-url-encoded и возвращает токены', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at-123',
            refresh_token: 'rt-456',
            id_token: 'idt-789',
            expires_in: 86400,
            user_id: 42,
          }),
      } as Response);

      const tokens = await service.exchangeCode('code-x', 'device-y', 'ver-z');
      expect(tokens.accessToken).toBe('at-123');
      expect(tokens.refreshToken).toBe('rt-456');
      expect(tokens.userId).toBe('42');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://id.vk.ru/oauth2/auth');
      expect(init.method).toBe('POST');
      const body = init.body as string;
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=code-x');
      expect(body).toContain('device_id=device-y');
      expect(body).toContain('code_verifier=ver-z');
      expect(body).toContain('client_id=54561856');
    });

    it('бросает UnauthorizedException при неуспешном ответе', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
      } as Response);

      await expect(
        service.exchangeCode('bad', 'dev', 'ver'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('fetchUserInfo', () => {
    it('парсит профиль из обёртки { user }', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            user: {
              user_id: 42,
              first_name: 'Ольга',
              last_name: 'Петрова',
              email: 'o@example.com',
              avatar: 'https://vk/avatar.jpg',
            },
          }),
      } as Response);

      const profile = await service.fetchUserInfo('at-123');
      expect(profile.provider).toBe(OAuthProvider.VK);
      expect(profile.providerId).toBe('42');
      expect(profile.email).toBe('o@example.com');
      expect(profile.emailVerified).toBe(false);
      expect(profile.firstName).toBe('Ольга');
      expect(profile.avatar).toBe('https://vk/avatar.jpg');
    });

    it('парсит flat-ответ без обёртки { user }', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            user_id: '99',
            first_name: 'Иван',
          }),
      } as Response);

      const profile = await service.fetchUserInfo('at-xxx');
      expect(profile.providerId).toBe('99');
      expect(profile.firstName).toBe('Иван');
      expect(profile.email).toBeNull();
    });

    it('бросает если нет user_id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ first_name: 'Никто' }),
      } as Response);

      await expect(service.fetchUserInfo('at')).rejects.toThrow();
    });
  });
});
