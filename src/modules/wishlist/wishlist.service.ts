import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { ProductsService } from '@/modules/products/products.service';
import { CartService } from '@/modules/cart/cart.service';
import { WishlistResponseDto, WishlistItemDto } from './dto';

@Injectable()
export class WishlistService {
  constructor(
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly cartService: CartService,
  ) {}

  async getWishlist(userId: string): Promise<WishlistResponseDto> {
    const user = await this.usersService.findByIdOrFail(userId);
    const wishlistIds = user.wishlist || [];

    const items: WishlistItemDto[] = [];

    for (const productId of wishlistIds) {
      try {
        const product = await this.productsService.findById(productId);
        const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);

        items.push({
          _id: product._id.toString(),
          name: product.name,
          slug: product.slug,
          price: product.price,
          image: product.images?.[0]?.url,
          inStock: totalStock > 0,
        });
      } catch {
        // Товар удалён — пропускаем
      }
    }

    return { items, total: items.length };
  }

  async addProduct(userId: string, productId: string): Promise<void> {
    const user = await this.usersService.findByIdOrFail(userId);

    // Проверяем существование товара
    await this.productsService.findById(productId);

    const wishlist = user.wishlist || [];

    if (wishlist.includes(productId)) {
      throw new ConflictException('Товар уже в списке желаний');
    }

    wishlist.push(productId);
    await this.usersService.update(userId, { wishlist } as any);
  }

  async removeProduct(userId: string, productId: string): Promise<void> {
    const user = await this.usersService.findByIdOrFail(userId);
    const wishlist = user.wishlist || [];

    const index = wishlist.indexOf(productId);
    if (index === -1) {
      throw new NotFoundException('Товар не найден в списке желаний');
    }

    wishlist.splice(index, 1);
    await this.usersService.update(userId, { wishlist } as any);
  }

  async isInWishlist(userId: string, productId: string): Promise<boolean> {
    const user = await this.usersService.findByIdOrFail(userId);
    const wishlist = user.wishlist || [];
    return wishlist.includes(productId);
  }

  async moveToCart(
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdOrFail(userId);
    const wishlist = user.wishlist || [];

    if (!wishlist.includes(productId)) {
      throw new NotFoundException('Товар не найден в списке желаний');
    }

    // Добавляем в корзину
    await this.cartService.addItem(userId, undefined, {
      productId,
      variantId,
      quantity: 1,
    });

    // Удаляем из wishlist
    const index = wishlist.indexOf(productId);
    wishlist.splice(index, 1);
    await this.usersService.update(userId, { wishlist } as any);
  }

  async clearWishlist(userId: string): Promise<void> {
    await this.usersService.findByIdOrFail(userId);
    await this.usersService.update(userId, { wishlist: [] } as any);
  }
}
