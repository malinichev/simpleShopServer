/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthAccountController } from './oauth-account.controller';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { VkIdOAuthService } from './vk-id.service';
import {
  OAuthProvider,
  UserOAuthIdentity,
} from '@/modules/users/entities/user-oauth-identity.entity';
import { User, UserRole } from '@/modules/users/entities/user.entity';
import { OAuthCannotUnlinkLastException } from './oauth.errors';

const makeUser = (): User =>
  ({
    id: 'user-1',
    email: 'a@b.com',
    password: null,
    firstName: 'A',
    lastName: 'B',
    role: UserRole.CUSTOMER,
    addresses: [],
    wishlist: [],
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as User;

const makeIdentity = (
  overrides: Partial<UserOAuthIdentity> = {},
): UserOAuthIdentity =>
  ({
    id: 'id-1',
    userId: 'user-1',
    provider: OAuthProvider.VK,
    providerId: 'vk-1',
    email: 'vk@example.com',
    profileData: {},
    createdAt: new Date('2026-04-24T10:00:00Z'),
    updatedAt: new Date('2026-04-24T10:00:00Z'),
    ...overrides,
  }) as UserOAuthIdentity;

describe('OAuthAccountController', () => {
  let controller: OAuthAccountController;
  let oauthService: jest.Mocked<OAuthService>;
  let stateService: jest.Mocked<OAuthStateService>;
  let vkIdService: jest.Mocked<VkIdOAuthService>;

  const config: Record<string, string> = {
    'oauth.yandex.clientId': 'yandex-cid',
    'oauth.yandex.callbackUrl':
      'http://localhost:4000/api/auth/yandex/callback',
  };

  beforeEach(async () => {
    const oauthMock: Partial<jest.Mocked<OAuthService>> = {
      listUserIdentities: jest.fn(),
      unlinkIdentity: jest.fn(),
    };
    const stateMock: Partial<jest.Mocked<OAuthStateService>> = {
      sign: jest.fn(),
    };
    const vkMock: Partial<jest.Mocked<VkIdOAuthService>> = {
      buildAuthorizeUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthAccountController],
      providers: [
        { provide: OAuthService, useValue: oauthMock },
        { provide: OAuthStateService, useValue: stateMock },
        { provide: VkIdOAuthService, useValue: vkMock },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => config[k] },
        },
      ],
    }).compile();

    controller = module.get(OAuthAccountController);
    oauthService = module.get(OAuthService);
    stateService = module.get(OAuthStateService);
    vkIdService = module.get(VkIdOAuthService);
  });

  describe('list', () => {
    it('возвращает мапленные identities текущего юзера', async () => {
      oauthService.listUserIdentities.mockResolvedValue([
        makeIdentity({ id: 'a', provider: OAuthProvider.VK }),
        makeIdentity({
          id: 'b',
          provider: OAuthProvider.YANDEX,
          email: 'y@ya.ru',
        }),
      ]);

      const result = await controller.list(makeUser());

      expect(result).toEqual([
        {
          id: 'a',
          provider: 'vk',
          email: 'vk@example.com',
          linkedAt: expect.any(Date),
        },
        {
          id: 'b',
          provider: 'yandex',
          email: 'y@ya.ru',
          linkedAt: expect.any(Date),
        },
      ]);
      expect(oauthService.listUserIdentities).toHaveBeenCalledWith('user-1');
    });
  });

  describe('unlink', () => {
    it('вызывает unlinkIdentity и возвращает success', async () => {
      oauthService.unlinkIdentity.mockResolvedValue(undefined);

      const result = await controller.unlink(makeUser(), 'id-1');

      expect(oauthService.unlinkIdentity).toHaveBeenCalledWith(
        'user-1',
        'id-1',
      );
      expect(result).toEqual({ message: 'unlinked' });
    });

    it('пробрасывает OAuthCannotUnlinkLastException', async () => {
      oauthService.unlinkIdentity.mockRejectedValue(
        new OAuthCannotUnlinkLastException(),
      );

      await expect(
        controller.unlink(makeUser(), 'id-1'),
      ).rejects.toBeInstanceOf(OAuthCannotUnlinkLastException);
    });

    it('пробрасывает NotFoundException', async () => {
      oauthService.unlinkIdentity.mockRejectedValue(
        new NotFoundException('Привязка не найдена'),
      );

      await expect(
        controller.unlink(makeUser(), 'id-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('linkInit', () => {
    it('VK: подписывает state с userId, генерит PKCE, возвращает authorizeUrl', async () => {
      stateService.sign.mockResolvedValue('signed-state');
      vkIdService.buildAuthorizeUrl.mockReturnValue(
        'https://id.vk.ru/authorize?xxx',
      );

      const result = await controller.linkInit(makeUser(), 'vk');

      expect(result.authorizeUrl).toBe('https://id.vk.ru/authorize?xxx');
      expect(stateService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'link',
          userId: 'user-1',
          codeVerifier: expect.any(String),
        }),
      );
      expect(vkIdService.buildAuthorizeUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'signed-state',
          codeChallenge: expect.any(String),
          scope: 'email',
        }),
      );
    });

    it('Yandex: возвращает oauth.yandex.ru URL с client_id и state', async () => {
      stateService.sign.mockResolvedValue('y-state');

      const result = await controller.linkInit(makeUser(), 'yandex');

      expect(result.authorizeUrl).toContain(
        'https://oauth.yandex.ru/authorize?',
      );
      expect(result.authorizeUrl).toContain('client_id=yandex-cid');
      expect(result.authorizeUrl).toContain('state=y-state');
      expect(result.authorizeUrl).toContain('response_type=code');
      expect(stateService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'link', userId: 'user-1' }),
      );
    });

    it('неизвестный провайдер → BadRequest', async () => {
      await expect(
        controller.linkInit(makeUser(), 'twitter'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(stateService.sign).not.toHaveBeenCalled();
    });
  });
});
