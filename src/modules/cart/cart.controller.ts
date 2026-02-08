import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CartService } from './cart.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  ApplyPromoDto,
  CartResponseDto,
} from './dto';
import { Public } from '@/common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';

interface RequestWithCart extends Request {
  cartSessionId: string;
  user?: { _id: string };
}

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получить корзину' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async getCart(@Req() req: RequestWithCart) {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.getCart(userId, sessionId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('items')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Добавить товар в корзину' })
  @ApiResponse({ status: 201, type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Недостаточно товара на складе' })
  async addItem(@Req() req: RequestWithCart, @Body() dto: AddToCartDto) {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.addItem(userId, sessionId, dto);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Patch('items/:variantId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Изменить количество товара в корзине' })
  @ApiParam({ name: 'variantId', description: 'ID варианта товара' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 404, description: 'Товар не найден в корзине' })
  async updateItem(
    @Req() req: RequestWithCart,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.updateItem(userId, sessionId, variantId, dto.quantity);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Delete('items/:variantId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Удалить товар из корзины' })
  @ApiParam({ name: 'variantId', description: 'ID варианта товара' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({ status: 404, description: 'Товар не найден в корзине' })
  async removeItem(
    @Req() req: RequestWithCart,
    @Param('variantId') variantId: string,
  ) {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.removeItem(userId, sessionId, variantId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Delete()
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Очистить корзину' })
  @ApiResponse({ status: 204, description: 'Корзина очищена' })
  async clearCart(@Req() req: RequestWithCart): Promise<void> {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    await this.cartService.clearCart(userId, sessionId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('promo')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Применить промокод' })
  @ApiResponse({ status: 201, type: CartResponseDto })
  @ApiResponse({ status: 400, description: 'Недействительный промокод' })
  async applyPromo(@Req() req: RequestWithCart, @Body() dto: ApplyPromoDto) {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.applyPromo(userId, sessionId, dto.code);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Delete('promo')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Удалить промокод' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async removePromo(@Req() req: RequestWithCart) {
    const userId = req.user?._id?.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.removePromo(userId, sessionId);
  }

  @Post('merge')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Слить гостевую корзину с пользовательской (после авторизации)' })
  @ApiResponse({ status: 201, type: CartResponseDto })
  async mergeCarts(@Req() req: RequestWithCart) {
    const userId = req.user!._id.toString();
    const sessionId = req.cartSessionId;
    return this.cartService.mergeCarts(userId, sessionId);
  }
}
