import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { CartRepository } from './cart.repository';
import { ProductsService } from '@/modules/products/products.service';
import { Cart, CartItem } from './entities/cart.entity';
import { AddToCartDto, CartResponseDto, CartItemResponseDto, CartTotalsDto } from './dto';
import { Product } from '@/modules/products/entities/product.entity';

const GUEST_CART_TTL_DAYS = 7;
const AUTH_CART_TTL_DAYS = 30;

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly productsService: ProductsService,
  ) {}

  async getCart(userId?: string, sessionId?: string): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);
    return this.buildCartResponse(cart);
  }

  async addItem(userId: string | undefined, sessionId: string | undefined, dto: AddToCartDto): Promise<CartResponseDto> {
    const product = await this.productsService.findById(dto.productId);
    const variant = product.variants.find((v) => v.id === dto.variantId);

    if (!variant) {
      throw new BadRequestException(`Вариант с id "${dto.variantId}" не найден`);
    }

    if (variant.stock < dto.quantity) {
      throw new BadRequestException(
        `Недостаточно товара на складе. Доступно: ${variant.stock}`,
      );
    }

    const cart = await this.findOrCreateCart(userId, sessionId);

    const existingIndex = cart.items.findIndex(
      (item) => item.variantId === dto.variantId && item.productId.toString() === dto.productId,
    );

    if (existingIndex >= 0) {
      const newQuantity = cart.items[existingIndex].quantity + dto.quantity;
      if (newQuantity > 10) {
        throw new BadRequestException('Максимальное количество одного товара — 10');
      }
      if (newQuantity > variant.stock) {
        throw new BadRequestException(
          `Недостаточно товара на складе. Доступно: ${variant.stock}`,
        );
      }
      cart.items[existingIndex].quantity = newQuantity;
      cart.items[existingIndex].price = variant.price ?? product.price;
    } else {
      cart.items.push({
        productId: new ObjectId(dto.productId),
        variantId: dto.variantId,
        quantity: dto.quantity,
        price: variant.price ?? product.price,
        addedAt: new Date(),
      });
    }

    const updated = await this.cartRepository.update(cart._id, { items: cart.items });
    return this.buildCartResponse(updated!);
  }

  async updateItem(
    userId: string | undefined,
    sessionId: string | undefined,
    variantId: string,
    quantity: number,
  ): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    if (quantity === 0) {
      return this.removeItem(userId, sessionId, variantId);
    }

    const itemIndex = cart.items.findIndex((item) => item.variantId === variantId);
    if (itemIndex < 0) {
      throw new NotFoundException('Товар не найден в корзине');
    }

    const item = cart.items[itemIndex];
    const product = await this.productsService.findById(item.productId.toString());
    const variant = product.variants.find((v) => v.id === variantId);

    if (variant && quantity > variant.stock) {
      throw new BadRequestException(
        `Недостаточно товара на складе. Доступно: ${variant.stock}`,
      );
    }

    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].price = variant?.price ?? product.price;

    const updated = await this.cartRepository.update(cart._id, { items: cart.items });
    return this.buildCartResponse(updated!);
  }

  async removeItem(userId: string | undefined, sessionId: string | undefined, variantId: string): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    const filteredItems = cart.items.filter((item) => item.variantId !== variantId);
    if (filteredItems.length === cart.items.length) {
      throw new NotFoundException('Товар не найден в корзине');
    }

    const updated = await this.cartRepository.update(cart._id, { items: filteredItems });
    return this.buildCartResponse(updated!);
  }

  async clearCart(userId: string | undefined, sessionId: string | undefined): Promise<void> {
    const cart = await this.findOrCreateCart(userId, sessionId);
    await this.cartRepository.update(cart._id, {
      items: [],
      promoCode: undefined,
      promoDiscount: undefined,
    });
  }

  async applyPromo(userId: string | undefined, sessionId: string | undefined, code: string): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    if (cart.items.length === 0) {
      throw new BadRequestException('Корзина пуста');
    }

    // TODO: Интеграция с PromotionsModule для проверки промокода
    // Пока используем заглушку
    const promoDiscount = this.validatePromoCode(code);

    const updated = await this.cartRepository.update(cart._id, {
      promoCode: code.toUpperCase(),
      promoDiscount,
    });
    return this.buildCartResponse(updated!);
  }

  async removePromo(userId: string | undefined, sessionId: string | undefined): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    const updated = await this.cartRepository.update(cart._id, {
      promoCode: undefined,
      promoDiscount: undefined,
    });
    return this.buildCartResponse(updated!);
  }

  async mergeCarts(userId: string, sessionId: string): Promise<CartResponseDto> {
    const guestCart = await this.cartRepository.findBySessionId(sessionId);
    let userCart = await this.cartRepository.findByUserId(userId);

    if (!guestCart || guestCart.items.length === 0) {
      if (!userCart) {
        userCart = await this.createCart(userId, undefined);
      }
      return this.buildCartResponse(userCart);
    }

    if (!userCart) {
      // Преобразуем гостевую корзину в пользовательскую
      const updated = await this.cartRepository.update(guestCart._id, {
        userId: new ObjectId(userId),
        sessionId: undefined,
        expiresAt: this.getExpiresAt(true),
      });
      return this.buildCartResponse(updated!);
    }

    // Сливаем: элементы гостевой корзины добавляются, если их нет в пользовательской
    for (const guestItem of guestCart.items) {
      const existingIndex = userCart.items.findIndex(
        (item) =>
          item.productId.toString() === guestItem.productId.toString() &&
          item.variantId === guestItem.variantId,
      );

      if (existingIndex >= 0) {
        // Берём большее количество
        userCart.items[existingIndex].quantity = Math.min(
          Math.max(userCart.items[existingIndex].quantity, guestItem.quantity),
          10,
        );
      } else {
        userCart.items.push(guestItem);
      }
    }

    const updated = await this.cartRepository.update(userCart._id, {
      items: userCart.items,
    });

    // Удаляем гостевую корзину
    await this.cartRepository.delete(guestCart._id);

    return this.buildCartResponse(updated!);
  }

  private async findOrCreateCart(userId?: string, sessionId?: string): Promise<Cart> {
    let cart: Cart | null = null;

    if (userId) {
      cart = await this.cartRepository.findByUserId(userId);
    } else if (sessionId) {
      cart = await this.cartRepository.findBySessionId(sessionId);
    }

    if (!cart) {
      cart = await this.createCart(userId, sessionId);
    }

    return cart;
  }

  private async createCart(userId?: string, sessionId?: string): Promise<Cart> {
    const isAuth = !!userId;
    return this.cartRepository.create({
      userId: userId ? new ObjectId(userId) : undefined,
      sessionId: isAuth ? undefined : sessionId,
      items: [],
      expiresAt: this.getExpiresAt(isAuth),
    });
  }

  private getExpiresAt(isAuth: boolean): Date {
    const days = isAuth ? AUTH_CART_TTL_DAYS : GUEST_CART_TTL_DAYS;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private async buildCartResponse(cart: Cart): Promise<CartResponseDto> {
    const items: CartItemResponseDto[] = [];
    const productsCache = new Map<string, Product>();

    for (const item of cart.items) {
      const productIdStr = item.productId.toString();

      let product = productsCache.get(productIdStr);
      if (!product) {
        try {
          product = await this.productsService.findById(productIdStr);
          productsCache.set(productIdStr, product);
        } catch {
          // Товар удалён — пропускаем
          continue;
        }
      }

      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) continue;

      const currentPrice = variant.price ?? product.price;

      items.push({
        product: {
          _id: product._id.toString(),
          name: product.name,
          slug: product.slug,
          image: product.images?.[0]?.url,
        },
        variant: {
          id: variant.id,
          size: variant.size,
          color: variant.color,
          colorHex: variant.colorHex,
        },
        variantId: item.variantId,
        quantity: item.quantity,
        price: currentPrice,
        total: currentPrice * item.quantity,
        inStock: variant.stock >= item.quantity,
        maxQuantity: Math.min(variant.stock, 10),
        addedAt: item.addedAt,
      });
    }

    const totals = this.calculateTotals(items, cart.promoDiscount);

    return {
      _id: cart._id.toString(),
      items,
      promoCode: cart.promoCode,
      promoDiscount: cart.promoDiscount,
      totals,
    };
  }

  private calculateTotals(items: CartItemResponseDto[], promoDiscount?: number): CartTotalsDto {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = promoDiscount
      ? Math.round(subtotal * (promoDiscount / 100) * 100) / 100
      : 0;

    return {
      subtotal,
      discount,
      total: subtotal - discount,
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  private validatePromoCode(code: string): number {
    // Заглушка — будет заменена интеграцией с PromotionsModule
    const promoCodes: Record<string, number> = {
      WELCOME10: 10,
      SALE20: 20,
    };

    const discount = promoCodes[code.toUpperCase()];
    if (!discount) {
      throw new BadRequestException('Недействительный промокод');
    }

    return discount;
  }
}
