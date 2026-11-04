import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { UsersService } from '@/modules/users/users.service';
import { ProductsService } from '@/modules/products/products.service';
import { CartService } from '@/modules/cart/cart.service';
import { UserRole } from '@/modules/users/entities/user.entity';
import type { User } from '@/modules/users/entities/user.entity';

/**
 * Регрессия 2026-11-04: super_admin получал 403 «Изменять главного
 * администратора…» на POST /wishlist — wishlist-сервис звал
 * usersService.update без currentUser. Сервис обязан пробрасывать
 * текущего пользователя: self-edit super_admin легален.
 */
const user = (role: UserRole, wishlist: string[] = []): User =>
  ({ id: 'u1', role, wishlist } as unknown as User);

describe('WishlistService (super_admin self-edit)', () => {
  let service: WishlistService;
  let usersService: { findByIdOrFail: jest.Mock; update: jest.Mock };
  let productsService: { findById: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByIdOrFail: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    productsService = { findById: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: UsersService, useValue: usersService },
        { provide: ProductsService, useValue: productsService },
        { provide: CartService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(WishlistService);
  });

  it('addProduct пробрасывает currentUser в usersService.update', async () => {
    const superAdmin = user(UserRole.SUPER_ADMIN);
    usersService.findByIdOrFail.mockResolvedValue(superAdmin);

    await service.addProduct('u1', 'p1', superAdmin);

    expect(usersService.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ wishlist: ['p1'] }),
      superAdmin,
    );
  });

  it('removeProduct тоже пробрасывает currentUser', async () => {
    const superAdmin = user(UserRole.SUPER_ADMIN, ['p1']);
    usersService.findByIdOrFail.mockResolvedValue(superAdmin);

    await service.removeProduct('u1', 'p1', superAdmin);

    expect(usersService.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ wishlist: [] }),
      superAdmin,
    );
  });

  it('404 при удалении отсутствующего товара остаётся', async () => {
    usersService.findByIdOrFail.mockResolvedValue(user(UserRole.CUSTOMER));
    await expect(service.removeProduct('u1', 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
