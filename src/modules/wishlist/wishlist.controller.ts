import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { WishlistResponseDto, MoveToCartDto } from './dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/modules/users/entities/user.entity';

@ApiTags('wishlist')
@ApiBearerAuth('JWT-auth')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Получить список желаний' })
  @ApiResponse({ status: 200, type: WishlistResponseDto })
  async getWishlist(@CurrentUser() user: User): Promise<WishlistResponseDto> {
    return this.wishlistService.getWishlist(user._id.toString());
  }

  @Post('move-to-cart')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Перенести товар из списка желаний в корзину' })
  @ApiResponse({ status: 204, description: 'Товар перенесён в корзину' })
  @ApiResponse({ status: 404, description: 'Товар не найден в списке желаний' })
  async moveToCart(
    @CurrentUser() user: User,
    @Body() dto: MoveToCartDto,
  ): Promise<void> {
    await this.wishlistService.moveToCart(
      user._id.toString(),
      dto.productId,
      dto.variantId,
    );
  }

  @Post(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Добавить товар в список желаний' })
  @ApiParam({ name: 'productId', description: 'ID товара' })
  @ApiResponse({ status: 204, description: 'Товар добавлен' })
  @ApiResponse({ status: 404, description: 'Товар не найден' })
  @ApiResponse({ status: 409, description: 'Товар уже в списке желаний' })
  async addProduct(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.wishlistService.addProduct(user._id.toString(), productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить товар из списка желаний' })
  @ApiParam({ name: 'productId', description: 'ID товара' })
  @ApiResponse({ status: 204, description: 'Товар удалён' })
  @ApiResponse({ status: 404, description: 'Товар не найден в списке желаний' })
  async removeProduct(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.wishlistService.removeProduct(user._id.toString(), productId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Очистить список желаний' })
  @ApiResponse({ status: 204, description: 'Список желаний очищен' })
  async clearWishlist(@CurrentUser() user: User): Promise<void> {
    await this.wishlistService.clearWishlist(user._id.toString());
  }
}
