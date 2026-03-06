import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CartRepository } from './cart.repository';
import { ProductsService } from '@/modules/products/products.service';
import { PromotionsService } from '@/modules/promotions/promotions.service';
import { Cart } from './entities/cart.entity';
import {
  AddToCartDto,
  CartResponseDto,
  CartItemResponseDto,
  CartTotalsDto,
} from './dto';
import { Product } from '@/modules/products/entities/product.entity';

const GUEST_CART_TTL_DAYS = 7;
const AUTH_CART_TTL_DAYS = 30;

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly productsService: ProductsService,
    private readonly promotionsService: PromotionsService,
  ) {}

  async getCart(userId?: string, sessionId?: string): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);
    return this.buildCartResponse(cart);
  }

  async addItem(
    userId: string | undefined,
    sessionId: string | undefined,
    dto: AddToCartDto,
  ): Promise<CartResponseDto> {
    const product = await this.productsService.findById(dto.productId);
    const variant = product.variants.find((v) => v.id === dto.variantId);

    if (!variant) {
      throw new BadRequestException(
        `Вариант с id "${dto.variantId}" не найден`,
      );
    }

    if (variant.stock < dto.quantity) {
      throw new BadRequestException(
        `Недостаточно товара на складе. Доступно: ${variant.stock}`,
      );
    }

    const cart = await this.findOrCreateCart(userId, sessionId);

    const existingItem = await this.cartRepository.findItemByCartAndVariant(
      cart.id,
      dto.variantId,
      dto.productId,
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + dto.quantity;
      if (newQuantity > 10) {
        throw new BadRequestException(
          'Максимальное количество одного товара — 10',
        );
      }
      if (newQuantity > variant.stock) {
        throw new BadRequestException(
          `Недостаточно товара на складе. Доступно: ${variant.stock}`,
        );
      }
      existingItem.quantity = newQuantity;
      existingItem.price = variant.price ?? product.price;
      await this.cartRepository.saveItem(existingItem);
    } else {
      await this.cartRepository.createItem({
        cartId: cart.id,
        productId: dto.productId,
        variantId: dto.variantId,
        quantity: dto.quantity,
        price: variant.price ?? product.price,
      });
    }

    const updatedCart = await this.cartRepository.findById(cart.id);
    return this.buildCartResponse(updatedCart!);
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

    const item = cart.items.find((item) => item.variantId === variantId);
    if (!item) {
      throw new NotFoundException('Товар не найден в корзине');
    }

    const product = await this.productsService.findById(item.productId);
    const variant = product.variants.find((v) => v.id === variantId);

    if (variant && quantity > variant.stock) {
      throw new BadRequestException(
        `Недостаточно товара на складе. Доступно: ${variant.stock}`,
      );
    }

    item.quantity = quantity;
    item.price = variant?.price ?? product.price;
    await this.cartRepository.saveItem(item);

    const updatedCart = await this.cartRepository.findById(cart.id);
    return this.buildCartResponse(updatedCart!);
  }

  async removeItem(
    userId: string | undefined,
    sessionId: string | undefined,
    variantId: string,
  ): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    const item = cart.items.find((item) => item.variantId === variantId);
    if (!item) {
      throw new NotFoundException('Товар не найден в корзине');
    }

    await this.cartRepository.deleteItem(item.id);

    const updatedCart = await this.cartRepository.findById(cart.id);
    return this.buildCartResponse(updatedCart!);
  }

  async clearCart(
    userId: string | undefined,
    sessionId: string | undefined,
  ): Promise<void> {
    const cart = await this.findOrCreateCart(userId, sessionId);
    await this.cartRepository.deleteItemsByCartId(cart.id);
    await this.cartRepository.update(cart.id, {
      promoCode: undefined,
      promoDiscount: undefined,
    });
  }

  async applyPromo(
    userId: string | undefined,
    sessionId: string | undefined,
    code: string,
  ): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    if (cart.items.length === 0) {
      throw new BadRequestException('Корзина пуста');
    }

    // Собираем данные корзины для валидации промокода
    const productsCache = new Map<string, Product>();
    const cartItems: Array<{
      productId: string;
      categoryId?: string;
      quantity: number;
      price: number;
    }> = [];

    for (const item of cart.items) {
      let product = productsCache.get(item.productId);
      if (!product) {
        try {
          product = await this.productsService.findById(item.productId);
          productsCache.set(item.productId, product);
        } catch {
          continue;
        }
      }
      cartItems.push({
        productId: item.productId,
        categoryId: product.categoryId,
        quantity: item.quantity,
        price: item.price,
      });
    }

    const cartTotal = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const result = await this.promotionsService.validate(code, userId ?? null, {
      cartTotal,
      items: cartItems,
    });

    if (!result.valid) {
      throw new BadRequestException(
        result.message ?? 'Недействительный промокод',
      );
    }

    await this.cartRepository.update(cart.id, {
      promoCode: code.toUpperCase(),
      promoDiscount: result.discount,
    });

    const updatedCart = await this.cartRepository.findById(cart.id);
    return this.buildCartResponse(updatedCart!);
  }

  async removePromo(
    userId: string | undefined,
    sessionId: string | undefined,
  ): Promise<CartResponseDto> {
    const cart = await this.findOrCreateCart(userId, sessionId);

    await this.cartRepository.update(cart.id, {
      promoCode: undefined,
      promoDiscount: undefined,
    });

    const updatedCart = await this.cartRepository.findById(cart.id);
    return this.buildCartResponse(updatedCart!);
  }

  async mergeCarts(
    userId: string,
    sessionId: string,
  ): Promise<CartResponseDto> {
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
      await this.cartRepository.update(guestCart.id, {
        userId,
        sessionId: undefined,
        expiresAt: this.getExpiresAt(true),
      });
      const updatedCart = await this.cartRepository.findById(guestCart.id);
      return this.buildCartResponse(updatedCart!);
    }

    // Если гостевая и пользовательская корзины — один и тот же объект
    if (guestCart.id === userCart.id) {
      return this.buildCartResponse(userCart);
    }

    // Сливаем: элементы гостевой корзины добавляются, если их нет в пользовательской
    for (const guestItem of guestCart.items) {
      const existingItem = userCart.items.find(
        (item) =>
          item.productId === guestItem.productId &&
          item.variantId === guestItem.variantId,
      );

      if (existingItem) {
        // Берём большее количество
        existingItem.quantity = Math.min(
          Math.max(existingItem.quantity, guestItem.quantity),
          10,
        );
        await this.cartRepository.saveItem(existingItem);
      } else {
        await this.cartRepository.createItem({
          cartId: userCart.id,
          productId: guestItem.productId,
          variantId: guestItem.variantId,
          quantity: guestItem.quantity,
          price: guestItem.price,
        });
      }
    }

    // Удаляем гостевую корзину
    await this.cartRepository.deleteItemsByCartId(guestCart.id);
    await this.cartRepository.delete(guestCart.id);

    const updatedCart = await this.cartRepository.findById(userCart.id);
    return this.buildCartResponse(updatedCart!);
  }

  private async findOrCreateCart(
    userId?: string,
    sessionId?: string,
  ): Promise<Cart> {
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
      userId: userId || undefined,
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
      let product = productsCache.get(item.productId);
      if (!product) {
        try {
          product = await this.productsService.findById(item.productId);
          productsCache.set(item.productId, product);
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
          id: product.id,
          name: product.name,
          slug: product.slug,
          image: product.images?.[0]?.url,
        },
        variant: {
          id: variant.id,
          size: variant.size,
          color: product.color ?? '',
          colorHex: product.colorHex ?? '',
        },
        variantId: item.variantId,
        quantity: item.quantity,
        price: currentPrice,
        total: currentPrice * item.quantity,
        inStock: variant.stock >= item.quantity,
        maxQuantity: Math.min(variant.stock, 10),
        addedAt: item.createdAt,
      });
    }

    const totals = this.calculateTotals(items, cart.promoDiscount);

    return {
      id: cart.id,
      items,
      promoCode: cart.promoCode,
      promoDiscount: cart.promoDiscount,
      totals,
    };
  }

  private calculateTotals(
    items: CartItemResponseDto[],
    promoDiscount?: number,
  ): CartTotalsDto {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = promoDiscount ? Math.min(promoDiscount, subtotal) : 0;

    return {
      subtotal,
      discount,
      total: subtotal - discount,
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }
}
