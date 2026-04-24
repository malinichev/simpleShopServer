/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OAuthService } from './oauth.service';
import { OAuthProfileDto } from './oauth-profile.dto';
import {
  OAuthAlreadyLinkedException,
  OAuthCannotUnlinkLastException,
  OAuthEmailConflictException,
} from './oauth.errors';
import { UsersService } from '@/modules/users/users.service';
import { UserOAuthIdentityRepository } from '@/modules/users/user-oauth-identity.repository';
import {
  UserOAuthIdentity,
  OAuthProvider,
} from '@/modules/users/entities/user-oauth-identity.entity';
import { User, UserRole } from '@/modules/users/entities/user.entity';

const yandexProfile = (
  overrides: Partial<OAuthProfileDto> = {},
): OAuthProfileDto => ({
  provider: OAuthProvider.YANDEX,
  providerId: 'yandex-123',
  email: 'user@ya.ru',
  emailVerified: true,
  firstName: 'Иван',
  lastName: 'Иванов',
  avatar: 'https://ava.example/1.png',
  ...overrides,
});

const vkProfile = (
  overrides: Partial<OAuthProfileDto> = {},
): OAuthProfileDto => ({
  provider: OAuthProvider.VK,
  providerId: 'vk-456',
  email: 'user@vk.com',
  emailVerified: false,
  firstName: 'Ольга',
  lastName: 'Петрова',
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'user@ya.ru',
    password: 'hashed',
    firstName: 'Иван',
    lastName: 'Иванов',
    role: UserRole.CUSTOMER,
    addresses: [],
    wishlist: [],
    isEmailVerified: true,
    refreshTokens: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

const makeIdentity = (
  overrides: Partial<UserOAuthIdentity> = {},
): UserOAuthIdentity =>
  ({
    id: 'identity-1',
    userId: 'user-1',
    provider: OAuthProvider.YANDEX,
    providerId: 'yandex-123',
    email: 'user@ya.ru',
    profileData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as UserOAuthIdentity;

describe('OAuthService', () => {
  let service: OAuthService;
  let usersService: jest.Mocked<UsersService>;
  let identityRepo: jest.Mocked<UserOAuthIdentityRepository>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    const usersMock: Partial<jest.Mocked<UsersService>> = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      findByEmail: jest.fn(),
    };

    const identityRepoMock: Partial<jest.Mocked<UserOAuthIdentityRepository>> =
      {
        findByProvider: jest.fn(),
        findByUserId: jest.fn(),
        findById: jest.fn(),
        link: jest.fn(),
        updateProfile: jest.fn(),
        unlink: jest.fn(),
      };

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: UserOAuthIdentityRepository, useValue: identityRepoMock },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(OAuthService);
    usersService = module.get(UsersService);
    identityRepo = module.get(UserOAuthIdentityRepository);
  });

  describe('findOrCreateByOAuth', () => {
    it('создаёт нового юзера + identity когда нет ни identity, ни юзера по email', async () => {
      identityRepo.findByProvider.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);

      const createdUser = makeUser({ id: 'new-user' });
      const createdIdentity = makeIdentity({
        userId: 'new-user',
        id: 'new-identity',
      });

      dataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => unknown) => {
          const manager = {
            save: jest
              .fn()
              .mockResolvedValueOnce(createdUser)
              .mockResolvedValueOnce(createdIdentity),
          } as unknown as EntityManager;
          return cb(manager);
        },
      );

      const result = await service.findOrCreateByOAuth(yandexProfile());

      expect(result.created).toBe(true);
      expect(result.user.id).toBe('new-user');
      expect(result.identity.id).toBe('new-identity');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('линкует identity к существующему юзеру при совпадении email (Yandex, verified)', async () => {
      const existing = makeUser({ id: 'existing-user', email: 'user@ya.ru' });
      identityRepo.findByProvider.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(existing);
      identityRepo.link.mockResolvedValue(
        makeIdentity({ userId: 'existing-user' }),
      );

      const result = await service.findOrCreateByOAuth(yandexProfile());

      expect(result.created).toBe(false);
      expect(result.user.id).toBe('existing-user');
      expect(identityRepo.link).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'existing-user',
          provider: OAuthProvider.YANDEX,
          providerId: 'yandex-123',
        }),
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('бросает OAuthEmailConflictException для VK с email, занятым другим юзером (не verified)', async () => {
      identityRepo.findByProvider.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(
        makeUser({ id: 'password-user', email: 'user@vk.com' }),
      );

      await expect(
        service.findOrCreateByOAuth(vkProfile()),
      ).rejects.toBeInstanceOf(OAuthEmailConflictException);

      expect(identityRepo.link).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('возвращает существующую связку без повторного link если identity найден', async () => {
      const identity = makeIdentity();
      const user = makeUser();
      identityRepo.findByProvider.mockResolvedValue(identity);
      identityRepo.updateProfile.mockResolvedValue({
        ...identity,
        profileData: { firstName: 'Иван' },
      } as UserOAuthIdentity);
      identityRepo.findById.mockResolvedValue(identity);
      usersService.findByIdOrFail.mockResolvedValue(user);

      const result = await service.findOrCreateByOAuth(yandexProfile());

      expect(result.created).toBe(false);
      expect(result.user.id).toBe(user.id);
      expect(identityRepo.link).not.toHaveBeenCalled();
      expect(identityRepo.updateProfile).toHaveBeenCalledWith(
        identity.id,
        expect.objectContaining({ email: 'user@ya.ru' }),
      );
    });
  });

  describe('linkToUser', () => {
    it('успешно линкует новый providerId к существующему юзеру', async () => {
      const user = makeUser();
      usersService.findById.mockResolvedValue(user);
      identityRepo.findByProvider.mockResolvedValue(null);
      identityRepo.link.mockResolvedValue(makeIdentity());

      const result = await service.linkToUser(user.id, yandexProfile());

      expect(result).toBeDefined();
      expect(identityRepo.link).toHaveBeenCalledWith(
        expect.objectContaining({ userId: user.id }),
      );
    });

    it('бросает OAuthAlreadyLinkedException если providerId привязан к другому юзеру', async () => {
      const user = makeUser({ id: 'user-1' });
      usersService.findById.mockResolvedValue(user);
      identityRepo.findByProvider.mockResolvedValue(
        makeIdentity({ userId: 'different-user' }),
      );

      await expect(
        service.linkToUser(user.id, yandexProfile()),
      ).rejects.toBeInstanceOf(OAuthAlreadyLinkedException);

      expect(identityRepo.link).not.toHaveBeenCalled();
    });
  });

  describe('unlinkIdentity', () => {
    it('бросает OAuthCannotUnlinkLastException если нет пароля и это последняя identity', async () => {
      const identity = makeIdentity();
      identityRepo.findById.mockResolvedValue(identity);
      usersService.findByIdOrFail.mockResolvedValue(
        makeUser({ password: null }),
      );
      identityRepo.findByUserId.mockResolvedValue([identity]);

      await expect(
        service.unlinkIdentity(identity.userId, identity.id),
      ).rejects.toBeInstanceOf(OAuthCannotUnlinkLastException);

      expect(identityRepo.unlink).not.toHaveBeenCalled();
    });

    it('успешно отвязывает если есть пароль', async () => {
      const identity = makeIdentity();
      identityRepo.findById.mockResolvedValue(identity);
      usersService.findByIdOrFail.mockResolvedValue(
        makeUser({ password: 'hashed' }),
      );
      identityRepo.findByUserId.mockResolvedValue([identity]);

      await service.unlinkIdentity(identity.userId, identity.id);

      expect(identityRepo.unlink).toHaveBeenCalledWith(identity.id);
    });

    it('успешно отвязывает если нет пароля, но есть другая identity', async () => {
      const identity = makeIdentity({ id: 'identity-1' });
      const another = makeIdentity({
        id: 'identity-2',
        provider: OAuthProvider.VK,
        providerId: 'vk-xyz',
      });
      identityRepo.findById.mockResolvedValue(identity);
      usersService.findByIdOrFail.mockResolvedValue(
        makeUser({ password: null }),
      );
      identityRepo.findByUserId.mockResolvedValue([identity, another]);

      await service.unlinkIdentity(identity.userId, identity.id);

      expect(identityRepo.unlink).toHaveBeenCalledWith(identity.id);
    });
  });
});
