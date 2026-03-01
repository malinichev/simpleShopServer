import { ApiProperty } from '@nestjs/swagger';

export class EligibleOrderItemDto {
  @ApiProperty({ description: 'Название товара' })
  name: string;

  @ApiProperty({ description: 'URL изображения' })
  image: string;

  @ApiProperty({ description: 'Размер' })
  size: string;

  @ApiProperty({ description: 'Цвет' })
  color: string;
}

export class EligibleOrderDto {
  @ApiProperty({ description: 'ID заказа' })
  id: string;

  @ApiProperty({ description: 'Номер заказа' })
  orderNumber: string;

  @ApiProperty({ description: 'Дата создания заказа' })
  createdAt: Date;

  @ApiProperty({ description: 'Товары из заказа', type: [EligibleOrderItemDto] })
  items: EligibleOrderItemDto[];
}

export class ReviewEligibilityDto {
  @ApiProperty({ description: 'Может ли пользователь оставить отзыв' })
  canReview: boolean;

  @ApiProperty({ description: 'Подходящие заказы', type: [EligibleOrderDto] })
  eligibleOrders: EligibleOrderDto[];

  @ApiProperty({ description: 'Пользователь уже оставлял отзыв' })
  hasReviewed: boolean;
}
