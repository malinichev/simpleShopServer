import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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
