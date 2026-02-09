import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '../entities/order.entity';
import type { OrderItem, OrderHistory } from '../entities/order.entity';
import type { Address } from '@/modules/users/entities/user.entity';

class OrderUserBriefDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  phone?: string;
}

export class OrderResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  orderNumber: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional({ type: OrderUserBriefDto })
  user?: OrderUserBriefDto;

  @ApiProperty({ type: [Object] })
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

  @ApiProperty({ type: Object })
  shippingAddress: Address;

  @ApiProperty()
  shippingMethod: string;

  @ApiProperty()
  paymentMethod: string;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus: PaymentStatus;

  @ApiPropertyOptional()
  promoCode?: string;

  @ApiPropertyOptional()
  promoDiscount?: number;

  @ApiPropertyOptional()
  customerNote?: string;

  @ApiPropertyOptional()
  adminNote?: string;

  @ApiProperty({ type: [Object] })
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
