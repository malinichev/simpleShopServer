import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '../entities/order.entity';
import type { OrderItem, OrderHistory } from '../entities/order.entity';
import type { Address } from '@/modules/users/entities/user.entity';

class OrderUserBriefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  phone?: string;
}

/** Снимок позиции заказа (entities/order.entity.ts OrderItem). */
export class OrderItemDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  variantId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  sku: string;

  @ApiPropertyOptional()
  image?: string;

  @ApiProperty()
  size: string;

  @ApiProperty()
  color: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  total: number;
}

export class OrderHistoryItemDto {
  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiPropertyOptional()
  comment?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  createdBy?: string;
}

/** Адрес доставки в ответе заказа (те же поля, что в ShippingAddressDto запроса). */
export class OrderShippingAddressDto {
  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional()
  country?: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  street: string;

  @ApiProperty()
  building: string;

  @ApiPropertyOptional()
  apartment?: string;

  @ApiProperty()
  postalCode: string;
}

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderNumber: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional({ type: OrderUserBriefDto })
  user?: OrderUserBriefDto;

  @ApiProperty({ type: [OrderItemDto] })
  items: OrderItem[];

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  discount: number;

  @ApiProperty()
  shipping: number;

  @ApiProperty()
  total: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ type: OrderShippingAddressDto })
  shippingAddress: Address;

  @ApiProperty()
  shippingMethod: string;

  @ApiProperty()
  paymentMethod: string;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus: PaymentStatus;

  @ApiPropertyOptional({
    description:
      'URL редиректа на платёжный шлюз (yookassa/stripe/...). ' +
      'Приходит только в ответе POST /orders при создании; в GET /orders/:id отсутствует.',
  })
  paymentRedirectUrl?: string;

  @ApiPropertyOptional()
  promoCode?: string;

  @ApiPropertyOptional()
  promoDiscount?: number;

  @ApiPropertyOptional()
  customerNote?: string;

  @ApiPropertyOptional()
  adminNote?: string;

  @ApiProperty({ type: [OrderHistoryItemDto] })
  history: OrderHistory[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: Record<string, number>;
  ordersByPaymentStatus: Record<string, number>;
}
