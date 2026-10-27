import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { ProductsService } from '@/modules/products/products.service';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { Cart } from './entities/cart.entity';

describe('CartService.removePromo — сброс промокода', () => {
  it('затирает promoCode/promoDiscount нулём, а не undefined', async () => {
    // Тот же класс бага, что и в clearCart: TypeORM Repository.update
    // ИГНОРИРУЕТ undefined-поля — с undefined промокод оставался на корзине
    // и крестик «удалить промокод» в витрине ничего не очищал.
    const cart = {
      id: 'cart-1',
      items: [],
      promoCode: 'SALE10',
      promoDiscount: 500,
    } as unknown as Cart;
    const repo = {
      findByUserId: jest.fn().mockResolvedValue(cart),
      findById: jest.fn().mockResolvedValue(cart),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: repo },
        { provide: ProductsService, useValue: {} },
        { provide: PromotionsService, useValue: {} },
      ],
    }).compile();

    const service = module.get(CartService);
    await service.removePromo('user-1', undefined);

    expect(repo.update).toHaveBeenCalledWith('cart-1', {
      promoCode: null,
      promoDiscount: null,
    });
  });
});

describe('CartService.clearCart — сброс промокода', () => {
  it('затирает promoCode/promoDiscount нулём, а не undefined', async () => {
    // TypeORM Repository.update ИГНОРИРУЕТ undefined-поля: с undefined
    // промокод оставался на корзине навсегда и подтягивался в следующие
    // заказы покупателя (скидка без ввода кода).
    const cart = { id: 'cart-1' } as Cart;
    const repo = {
      deleteItemsByCartId: jest.fn(),
      update: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue(cart),
      findBySessionId: jest.fn().mockResolvedValue(cart),
      create: jest.fn().mockReturnValue(cart),
      save: jest.fn().mockResolvedValue(cart),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: repo },
        { provide: ProductsService, useValue: {} },
        { provide: PromotionsService, useValue: {} },
      ],
    }).compile();

    const service = module.get(CartService);
    await service.clearCart('user-1', undefined);

    expect(repo.deleteItemsByCartId).toHaveBeenCalledWith('cart-1');
    expect(repo.update).toHaveBeenCalledWith('cart-1', {
      promoCode: null,
      promoDiscount: null,
    });
  });
});
