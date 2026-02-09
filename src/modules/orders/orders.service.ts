import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { OrdersRepository } from './orders.repository';
import { CartService } from '@/modules/cart/cart.service';
import { ProductsService } from '@/modules/products/products.service';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { UsersService } from '@/modules/users/users.service';
import { Order, OrderStatus, OrderItem, OrderHistory } from './entities/order.entity';
import { CreateOrderDto, OrderQueryDto, OrderResponseDto, OrderStats } from './dto';
import { Address } from '@/modules/users/entities/user.entity';
import { PaginatedResult } from '@/common/types/pagination.types';

const SHIPPING_COSTS: Record<string, number> = {
  courier: 500,
  pickup: 0,
  post: 300,
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly cartService: CartService,
    private readonly productsService: ProductsService,
    private readonly promotionsService: PromotionsService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    // 1. Получить корзину пользователя
    console.log({ userId, dto });
    const cart = await this.cartService.getCart(userId);
    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestException('Корзина пуста');
    }

    // 2. Определить адрес доставки
    const shippingAddress = await this.resolveShippingAddress(userId, dto);

    // 3. Проверить наличие товаров и собрать items
    const orderItems: OrderItem[] = [];
    for (const cartItem of cart.items) {
      const product = await this.productsService.findById(cartItem.product._id);
      const variant = product.variants.find((v) => v.id === cartItem.variantId);

      if (!variant) {
        throw new BadRequestException(
          `Вариант "${cartItem.variantId}" товара "${product.name}" не найден`,
        );
      }

      if (variant.stock < cartItem.quantity) {
        throw new BadRequestException(
          `Недостаточно товара "${product.name}" (${variant.size}, ${variant.color}). Доступно: ${variant.stock}`,
        );
      }

      orderItems.push({
        productId: new ObjectId(cartItem.product._id),
        variantId: cartItem.variantId,
        name: product.name,
        sku: variant.sku,
        image: product.images?.[0]?.url || '',
        size: variant.size,
        color: variant.color,
        price: cartItem.price,
        quantity: cartItem.quantity,
        total: cartItem.total,
      });
    }

    // 4. Рассчитать итоги
    const subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
    const shipping = SHIPPING_COSTS[dto.shippingMethod] ?? 0;
    let discount = 0;
    let promoCode: string | undefined;
    let promoDiscount: number | undefined;

    // 5. Применить промокод (если есть)
    if (dto.promoCode) {
      const promoValidation = await this.promotionsService.validate(
        dto.promoCode,
        userId,
        {
          cartTotal: subtotal,
          items: orderItems.map((item) => ({
            productId: item.productId.toString(),
            quantity: item.quantity,
            price: item.price,
          })),
        },
      );

      if (promoValidation.valid) {
        discount = promoValidation.discount;
        promoCode = dto.promoCode.toUpperCase();
        promoDiscount = discount;
      }
    }

    const total = Math.max(subtotal - discount + shipping, 0);

    // 6. Сгенерировать номер заказа
    const orderNumber = await this.generateOrderNumber();

    // 7. Создать заказ
    const initialHistory: OrderHistory = {
      status: OrderStatus.PENDING,
      comment: 'Заказ создан',
      createdAt: new Date(),
    };

    const order = await this.ordersRepository.create({
      orderNumber,
      userId: new ObjectId(userId),
      items: orderItems,
      subtotal,
      discount,
      shipping,
      total,
      status: OrderStatus.PENDING,
      shippingAddress,
      shippingMethod: dto.shippingMethod,
      paymentMethod: dto.paymentMethod,
      promoCode,
      promoDiscount,
      customerNote: dto.customerNote,
      history: [initialHistory],
    });

    // 8. Очистить корзину
    await this.cartService.clearCart(userId, undefined);

    // 9. Обновить stock товаров
    for (const item of orderItems) {
      const product = await this.productsService.findById(item.productId.toString());
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (variant) {
        const newStock = Math.max(variant.stock - item.quantity, 0);
        await this.productsService.updateStock(
          item.productId.toString(),
          item.variantId,
          newStock,
        );
      }
    }

    // 10. Зачесть использование промокода
    if (promoCode) {
      await this.promotionsService.applyUsage(promoCode, userId);
    }

    // TODO: Отправить email через очередь (интеграция с Mail модулем)

    return order;
  }

  async findAll(query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    return this.ordersRepository.findAll(query);
  }

  async findById(id: string): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }
    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.ordersRepository.findByOrderNumber(orderNumber);
    if (!order) {
      throw new NotFoundException(`Заказ с номером "${orderNumber}" не найден`);
    }
    return order;
  }

  async findByUser(userId: string, query: OrderQueryDto): Promise<PaginatedResult<Order>> {
    return this.ordersRepository.findByUser(userId, query);
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    adminId?: string,
    comment?: string,
  ): Promise<Order> {
    const order = await this.findById(id);

    this.validateStatusTransition(order.status, status);

    const historyEntry: OrderHistory = {
      status,
      comment,
      createdAt: new Date(),
      createdBy: adminId ? new ObjectId(adminId) : undefined,
    };

    const updatedHistory = [...order.history, historyEntry];

    const updated = await this.ordersRepository.update(id, {
      status,
      history: updatedHistory,
    });

    if (!updated) {
      throw new NotFoundException('Заказ не найден');
    }

    return updated;
  }

  async cancel(id: string, userId: string, isAdmin: boolean): Promise<Order> {
    const order = await this.findById(id);

    if (!isAdmin && order.userId.toString() !== userId) {
      throw new ForbiddenException('Нет прав для отмены этого заказа');
    }

    if (!isAdmin && ![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
      throw new BadRequestException(
        'Отмена возможна только для заказов в статусе "ожидает" или "подтверждён"',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Заказ уже отменён');
    }

    // Вернуть stock товаров
    for (const item of order.items) {
      const product = await this.productsService.findById(item.productId.toString());
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (variant) {
        await this.productsService.updateStock(
          item.productId.toString(),
          item.variantId,
          variant.stock + item.quantity,
        );
      }
    }

    const historyEntry: OrderHistory = {
      status: OrderStatus.CANCELLED,
      comment: isAdmin ? 'Отменён администратором' : 'Отменён покупателем',
      createdAt: new Date(),
      createdBy: new ObjectId(userId),
    };

    const updatedHistory = [...order.history, historyEntry];

    const updated = await this.ordersRepository.update(id, {
      status: OrderStatus.CANCELLED,
      history: updatedHistory,
    });

    if (!updated) {
      throw new NotFoundException('Заказ не найден');
    }

    return updated;
  }

  async getStats(dateFrom?: Date, dateTo?: Date): Promise<OrderStats> {
    const revenueStats = await this.ordersRepository.getRevenueStats(dateFrom, dateTo);
    const ordersByStatus = await this.ordersRepository.countByStatus();
    const ordersByPaymentStatus = await this.ordersRepository.countByPaymentStatus();
    const totalOrders = await this.ordersRepository.count();

    return {
      totalOrders,
      totalRevenue: revenueStats.totalRevenue,
      averageOrderValue: revenueStats.count > 0
        ? Math.round((revenueStats.totalRevenue / revenueStats.count) * 100) / 100
        : 0,
      ordersByStatus,
      ordersByPaymentStatus,
    };
  }

  async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastOrder = await this.ordersRepository.getLastOrderNumber();

    let sequence = 1;
    if (lastOrder) {
      const parts = lastOrder.split('-');
      const lastSequence = parseInt(parts[2], 10);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    return `SP-${year}-${String(sequence).padStart(6, '0')}`;
  }

  toResponseDto(
    order: Order,
    user?: { _id: ObjectId; email: string; firstName: string; lastName: string; phone?: string },
  ): OrderResponseDto {
    return {
      _id: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId.toString(),
      user: user
        ? {
            _id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
          }
        : undefined,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      total: order.total,
      status: order.status,
      shippingAddress: order.shippingAddress,
      shippingMethod: order.shippingMethod,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      promoCode: order.promoCode,
      promoDiscount: order.promoDiscount,
      customerNote: order.customerNote,
      adminNote: order.adminNote,
      history: order.history,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async resolveShippingAddress(userId: string, dto: CreateOrderDto): Promise<Address> {
    if (dto.shippingAddressId) {
      const user = await this.usersService.findByIdOrFail(userId);
      const address = user.addresses.find((a) => a.id === dto.shippingAddressId);
      if (!address) {
        throw new BadRequestException('Адрес не найден');
      }
      return address;
    }

    if (dto.shippingAddress) {
      return {
        id: `addr-${Date.now()}`,
        title: 'Адрес доставки',
        firstName: dto.shippingAddress.firstName,
        lastName: dto.shippingAddress.lastName,
        phone: dto.shippingAddress.phone,
        city: dto.shippingAddress.city,
        street: dto.shippingAddress.street,
        building: dto.shippingAddress.building,
        apartment: dto.shippingAddress.apartment,
        postalCode: dto.shippingAddress.postalCode,
        isDefault: false,
      };
    }

    throw new BadRequestException('Необходимо указать адрес доставки (shippingAddressId или shippingAddress)');
  }

  private validateStatusTransition(current: OrderStatus, next: OrderStatus): void {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.REFUNDED]: [],
    };

    if (!allowed[current]?.includes(next)) {
      throw new BadRequestException(
        `Невозможно изменить статус с "${current}" на "${next}"`,
      );
    }
  }
}
