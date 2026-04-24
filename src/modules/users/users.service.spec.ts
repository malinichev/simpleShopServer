import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { User, UserRole } from './entities/user.entity';

const makeUser = (overrides: Partial<User> = {}): User =>
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
    ...overrides,
  }) as User;

describe('UsersService.setInitialPassword', () => {
  let service: UsersService;
  let repo: jest.Mocked<Pick<UsersRepository, 'findById' | 'update'>>;

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: repo }],
    }).compile();

    service = module.get(UsersService);
  });

  it('устанавливает пароль если password=null, хеширует через bcrypt', async () => {
    repo.findById.mockResolvedValue(makeUser({ password: null }));
    repo.update.mockResolvedValue(makeUser());

    await service.setInitialPassword('user-1', 'NewPass123!');

    expect(repo.update).toHaveBeenCalledTimes(1);
    const [id, patch] = repo.update.mock.calls[0] as [
      string,
      { password: string },
    ];
    expect(id).toBe('user-1');
    expect(patch.password).not.toBe('NewPass123!'); // захеширован
    expect(await bcrypt.compare('NewPass123!', patch.password)).toBe(true);
  });

  it('бросает BadRequest если пароль уже задан', async () => {
    repo.findById.mockResolvedValue(makeUser({ password: 'hashed' }));

    await expect(
      service.setInitialPassword('user-1', 'NewPass123!'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('бросает NotFound если юзер не найден', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.setInitialPassword('missing', 'NewPass123!'),
    ).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('UsersService email change', () => {
  let service: UsersService;
  let repo: jest.Mocked<
    Pick<
      UsersRepository,
      'findById' | 'findByEmail' | 'findByPendingEmailToken' | 'update'
    >
  >;

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPendingEmailToken: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: repo }],
    }).compile();

    service = module.get(UsersService);
  });

  describe('requestEmailChange', () => {
    it('успех: пишет pendingEmail+hashed token+expires, возвращает plain token', async () => {
      const passwordHash = await bcrypt.hash('CurrentPass1!', 4);
      repo.findById.mockResolvedValue(
        makeUser({ password: passwordHash, email: 'old@b.com' }),
      );
      repo.findByEmail.mockResolvedValue(null);
      repo.update.mockResolvedValue(makeUser());

      const { token } = await service.requestEmailChange(
        'user-1',
        'NEW@B.com',
        'CurrentPass1!',
      );

      expect(token).toMatch(/^[a-f0-9]{64}$/);
      const [, patch] = repo.update.mock.calls[0] as [string, Partial<User>];
      expect(patch.pendingEmail).toBe('new@b.com'); // нормализован к нижнему регистру
      expect(patch.pendingEmailToken).toBe(
        crypto.createHash('sha256').update(token).digest('hex'),
      );
      expect(patch.pendingEmailExpires).toBeInstanceOf(Date);
    });

    it('OAuth-only юзер (password=null) → BadRequest «сначала установите пароль»', async () => {
      repo.findById.mockResolvedValue(makeUser({ password: null }));

      await expect(
        service.requestEmailChange('user-1', 'new@b.com', 'whatever'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('неверный пароль → Unauthorized', async () => {
      const passwordHash = await bcrypt.hash('CurrentPass1!', 4);
      repo.findById.mockResolvedValue(makeUser({ password: passwordHash }));

      await expect(
        service.requestEmailChange('user-1', 'new@b.com', 'WrongPass'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('новый email = текущий → BadRequest', async () => {
      const passwordHash = await bcrypt.hash('CurrentPass1!', 4);
      repo.findById.mockResolvedValue(
        makeUser({ password: passwordHash, email: 'me@b.com' }),
      );

      await expect(
        service.requestEmailChange('user-1', 'me@b.com', 'CurrentPass1!'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('новый email занят другим юзером → Conflict', async () => {
      const passwordHash = await bcrypt.hash('CurrentPass1!', 4);
      repo.findById.mockResolvedValue(
        makeUser({ password: passwordHash, email: 'me@b.com' }),
      );
      repo.findByEmail.mockResolvedValue(
        makeUser({ id: 'other', email: 'taken@b.com' }),
      );

      await expect(
        service.requestEmailChange('user-1', 'taken@b.com', 'CurrentPass1!'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmailChange', () => {
    const token = 'a'.repeat(64);
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    it('успех: переносит pendingEmail в email, чистит pending, обнуляет refreshTokens', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      repo.findByPendingEmailToken.mockResolvedValue(
        makeUser({
          pendingEmail: 'new@b.com',
          pendingEmailToken: hashedToken,
          pendingEmailExpires: future,
        }),
      );
      repo.findByEmail.mockResolvedValue(null);
      repo.update.mockResolvedValue(makeUser({ email: 'new@b.com' }));
      repo.findById.mockResolvedValue(makeUser({ email: 'new@b.com' }));

      await service.confirmEmailChange(token);

      const [, patch] = repo.update.mock.calls[0] as [string, Partial<User>];
      expect(patch.email).toBe('new@b.com');
      expect(patch.pendingEmail).toBeUndefined();
      expect(patch.pendingEmailToken).toBeUndefined();
      expect(patch.refreshTokens).toBeNull();
    });

    it('токен не найден → BadRequest', async () => {
      repo.findByPendingEmailToken.mockResolvedValue(null);

      await expect(
        service.confirmEmailChange('whatever'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('токен истёк → BadRequest', async () => {
      const past = new Date(Date.now() - 1000);
      repo.findByPendingEmailToken.mockResolvedValue(
        makeUser({
          pendingEmail: 'new@b.com',
          pendingEmailToken: hashedToken,
          pendingEmailExpires: past,
        }),
      );

      await expect(service.confirmEmailChange(token)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('race condition: pendingEmail успели занять — Conflict + чистим pending', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      repo.findByPendingEmailToken.mockResolvedValue(
        makeUser({
          id: 'user-1',
          pendingEmail: 'new@b.com',
          pendingEmailToken: hashedToken,
          pendingEmailExpires: future,
        }),
      );
      repo.findByEmail.mockResolvedValue(
        makeUser({ id: 'other', email: 'new@b.com' }),
      );

      await expect(service.confirmEmailChange(token)).rejects.toBeInstanceOf(
        ConflictException,
      );

      // pending очищены, email НЕ обновлён
      const [, patch] = repo.update.mock.calls[0] as [string, Partial<User>];
      expect(patch.email).toBeUndefined();
      expect(patch.pendingEmail).toBeUndefined();
      expect(patch.pendingEmailToken).toBeUndefined();
    });
  });
});
