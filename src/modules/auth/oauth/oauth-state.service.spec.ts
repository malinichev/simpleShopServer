import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { OAuthStateService } from './oauth-state.service';

describe('OAuthStateService', () => {
  let service: OAuthStateService;

  const config: Record<string, string> = {
    'oauth.stateSecret': 'test-state-secret',
    'oauth.stateExpiresIn': '5m',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        OAuthStateService,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => config[k] },
        },
      ],
    }).compile();

    service = module.get(OAuthStateService);
  });

  describe('sign / verify', () => {
    it('signed state roundtrips через verify', async () => {
      const token = await service.sign({
        mode: 'login',
        redirectTo: '/checkout',
        codeVerifier: 'abc-verifier',
      });
      const payload = await service.verify(token);
      expect(payload.mode).toBe('login');
      expect(payload.redirectTo).toBe('/checkout');
      expect(payload.codeVerifier).toBe('abc-verifier');
      expect(payload.nonce).toBeDefined();
    });

    it('verify отвергает токен с неправильной подписью', async () => {
      const token = await service.sign({ mode: 'login' });
      const tampered = token.slice(0, -4) + 'XXXX';
      await expect(service.verify(tampered)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('signHandoff / verifyHandoff', () => {
    it('handoff token roundtrips с userId', async () => {
      const token = await service.signHandoff('user-42');
      const payload = await service.verifyHandoff(token);
      expect(payload.userId).toBe('user-42');
      expect(payload.handoff).toBe(true);
    });

    it('verifyHandoff отвергает обычный state-token (handoff!=true)', async () => {
      const stateToken = await service.sign({
        mode: 'login',
        userId: 'user-1',
      });
      await expect(service.verifyHandoff(stateToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('verifyHandoff отвергает токен с неправильной подписью', async () => {
      const token = await service.signHandoff('user-1');
      const tampered = token.slice(0, -4) + 'XXXX';
      await expect(service.verifyHandoff(tampered)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
