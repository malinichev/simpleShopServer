/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { OAuthAuthController } from './oauth-auth.controller';
import { AuthService } from '../auth.service';
import { UsersService } from '@/modules/users/users.service';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { VkIdOAuthService } from './vk-id.service';
import { User, UserRole } from '@/modules/users/entities/user.entity';
import { TokenAudience } from '@/common/types';

const makeUser = (): User =>
  ({
    id: 'user-42',
    email: 'u@example.com',
    password: null,
    firstName: 'U',
    lastName: 'U',
    role: UserRole.CUSTOMER,
    addresses: [],
    wishlist: [],
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as User;

describe('OAuthAuthController.oauthExchange', () => {
  let controller: OAuthAuthController;
  let authService: jest.Mocked<AuthService>;
  let usersService: jest.Mocked<UsersService>;
  let stateService: jest.Mocked<OAuthStateService>;

  beforeEach(async () => {
    const authMock: Partial<jest.Mocked<AuthService>> = {
      login: jest.fn(),
    };
    const usersMock: Partial<jest.Mocked<UsersService>> = {
      findByIdOrFail: jest.fn(),
    };
    const oauthMock: Partial<jest.Mocked<OAuthService>> = {};
    const stateMock: Partial<jest.Mocked<OAuthStateService>> = {
      verifyHandoff: jest.fn(),
    };
    const vkMock: Partial<jest.Mocked<VkIdOAuthService>> = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthAuthController],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: UsersService, useValue: usersMock },
        { provide: OAuthService, useValue: oauthMock },
        { provide: OAuthStateService, useValue: stateMock },
        { provide: VkIdOAuthService, useValue: vkMock },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    controller = module.get(OAuthAuthController);
    authService = module.get(AuthService);
    usersService = module.get(UsersService);
    stateService = module.get(OAuthStateService);
  });

  const mockResponse = () => {
    const res: Partial<Response> = {
      cookie: jest.fn().mockReturnThis() as Response['cookie'],
    };
    return res as Response;
  };

  it('валидный handoff → возвращает {user, accessToken} + ставит cookie', async () => {
    stateService.verifyHandoff.mockResolvedValue({
      userId: 'user-42',
      handoff: true,
      nonce: 'n',
    });
    usersService.findByIdOrFail.mockResolvedValue(makeUser());
    authService.login.mockResolvedValue({
      user: { id: 'user-42' } as never,
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
    });

    const res = mockResponse();
    const result = await controller.oauthExchange('valid-handoff', res);

    expect(stateService.verifyHandoff).toHaveBeenCalledWith('valid-handoff');
    expect(usersService.findByIdOrFail).toHaveBeenCalledWith('user-42');
    expect(authService.login).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-42' }),
      TokenAudience.WEB,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-456',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(result.accessToken).toBe('access-123');
    expect(result.user).toEqual({ id: 'user-42' });
  });

  it('отсутствует handoff → BadRequest', async () => {
    await expect(
      controller.oauthExchange(undefined, mockResponse()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stateService.verifyHandoff).not.toHaveBeenCalled();
  });

  it('невалидный handoff → пробрасывает UnauthorizedException от stateService', async () => {
    stateService.verifyHandoff.mockRejectedValue(
      new UnauthorizedException('bad handoff'),
    );

    await expect(
      controller.oauthExchange('bad-token', mockResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.login).not.toHaveBeenCalled();
  });
});
