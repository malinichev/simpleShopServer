import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrderMarkingService } from '@/modules/marking/order-marking.service';
import { CartService } from '@/modules/cart/cart.service';
import { ProductsService } from '@/modules/products/products.service';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { UsersService } from '@/modules/users/users.service';
import { MailService } from '@/modules/mail/mail.service';
import { PaymentsService } from '@/modules/payments/payments.service';
import { OrderItemEntity } from './entities/order-item.entity';

/**
 * Инвариант оформления заказа: корзина покупателя очищается ТОЛЬКО когда
 * заказ гарантированно создан и проведён. Если любой шаг после сохранения
 * заказа падает — POST /orders возвращает ошибку, а корзина остаётся
 * нетронутой (иначе покупатель теряет корзину без заказа — репорт из прод-теста).
 */

const USER_ID = 'user-1';
const PRODUCT_ID = 'p1';
const VARIANT_ID = 'v1';

function makeDeps() {
  return {
    ordersRepository: {
      create: jest.fn().mockImplementation((data) => ({ id: 'order-1', ...data })),
      getLastOrderNumber: jest.fn().mockResolvedValue('SP-2026-000042'),
      updateFields: jest.fn(),
    } as unknown as OrdersRepository,
    orderMarkingService: {
      reserveCodesForOrder: jest.fn().mockResolvedValue({ items: [], fullyAssigned: true }),
    } as unknown as OrderMarkingService,
    cartService: {
      getCart: jest.fn().mockResolvedValue({
        id: 'cart-1',
        promoCode: null,
        items: [
          {
            product: { id: PRODUCT_ID, name: 'Леггинсы', slug: 'leggings' },
            variantId: VARIANT_ID,
            quantity: 1,
            price: 2900,
            total: 2900,
          },
        ],
      }),
      clearCart: jest.fn().mockResolvedValue(undefined),
    } as unknown as CartService,
    productsService: {
      findById: jest.fn().mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Леггинсы',
        requiresMarking: false,
        variants: [{ id: VARIANT_ID, size: 'M', stock: 5 }],
      }),
      updateStock: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProductsService,
    promotionsService: {
      validate: jest.fn(),
      applyUsage: jest.fn().mockResolvedValue(undefined),
    } as unknown as PromotionsService,
    usersService: {
      findById: jest.fn().mockResolvedValue({ id: USER_ID, email: 'e2e@shop.local' }),
      findByIdOrFail: jest.fn(),
    } as unknown as UsersService,
    mailService: { sendOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined) } as unknown as MailService,
    configService: { get: jest.fn().mockReturnValue('http://localhost:3002') } as unknown as ConfigService,
    orderItemRepository: { save: jest.fn() } as unknown as Repository<OrderItemEntity>,
    paymentsService: {
      initializeForOrder: jest.fn().mockResolvedValue({ status: 'pending' }),
    } as unknown as PaymentsService,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  const service = new OrdersService(
    deps.ordersRepository,
    deps.orderMarkingService,
    deps.cartService,
    deps.productsService,
    deps.promotionsService,
    deps.usersService,
    deps.mailService,
    deps.configService,
    deps.orderItemRepository,
    deps.paymentsService,
  );
  // Logger молчит в тестах
  (service as unknown as { logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock } }).logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return service;
}

const ORDER_DTO = {
  shippingAddress: {
    firstName: 'Е2Е',
    lastName: 'Покупатель',
    phone: '+79990001122',
    city: 'Москва',
    street: 'ул. Тестовая',
    building: '1',
    postalCode: '101000',
  },
  shippingMethod: 'courier',
  paymentMethod: 'manual',
} as Parameters<OrdersService['create']>[1];

describe('OrdersService.create — целостность корзины', () => {
  it('успешный заказ очищает корзину', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.create(USER_ID, ORDER_DTO);

    expect(result.order.id).toBe('order-1');
    expect(deps.cartService.clearCart).toHaveBeenCalledWith(USER_ID, undefined);
  });

  it('сбой инициализации оплаты не очищает корзину (заказ уже создан)', async () => {
    const deps = makeDeps();
    deps.paymentsService.initializeForOrder = jest
      .fn()
      .mockRejectedValue(new Error('payment driver exploded'));
    const service = makeService(deps);

    await expect(service.create(USER_ID, ORDER_DTO)).rejects.toThrow(
      /payment driver exploded/,
    );

    expect(deps.ordersRepository.create).toHaveBeenCalledTimes(1);
    expect(deps.cartService.clearCart).not.toHaveBeenCalled();
  });
});
