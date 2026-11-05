import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UserBriefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

/** Сводка отзывов товара: свои / поставщик / комбинированный рейтинг. */
export class ReviewsSummaryDto {
  @ApiProperty({ description: 'Своих одобренных отзывов' })
  localCount: number;

  @ApiProperty({ description: 'Средняя оценка своих отзывов (0 — нет отзывов)' })
  localRating: number;

  @ApiProperty({ description: 'Отзывов поставщика (нескрытых)' })
  externalCount: number;

  @ApiProperty({
    description: 'Средняя оценка отзывов поставщика (0 — нет отзывов)',
  })
  externalRating: number;

  @ApiProperty({ description: 'Комбинированная оценка (свои + поставщик)' })
  rating: number;

  @ApiProperty({ description: 'Всего отзывов (свои + поставщик)' })
  total: number;
}

export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({
    enum: ['local', 'sima-land'],
    description: 'local — покупатель магазина, sima-land — поставщик',
  })
  source: string;

  @ApiPropertyOptional({
    description: 'Только для source=local',
  })
  userId?: string;

  @ApiPropertyOptional({ type: UserBriefDto })
  user?: UserBriefDto;

  @ApiPropertyOptional({ description: 'Только для source=local' })
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Скрыт ли внешний отзыв с витрины (source=sima-land)',
  })
  isHidden?: boolean;

  @ApiProperty()
  rating: number;

  @ApiPropertyOptional()
  title?: string;

  @ApiProperty()
  text: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiPropertyOptional({ description: 'Имя автора (для внешних отзывов)' })
  authorName?: string;

  @ApiPropertyOptional({ description: 'Достоинства (внешние отзывы)' })
  pros?: string;

  @ApiPropertyOptional({ description: 'Недостатки (внешние отзывы)' })
  cons?: string;

  @ApiPropertyOptional({
    description: 'Подтверждённая покупка (у своих — заказ, у внешних — поставщик)',
  })
  isVerifiedPurchase?: boolean;

  @ApiProperty()
  isAnonymous: boolean;

  @ApiProperty()
  isApproved: boolean;

  @ApiPropertyOptional()
  adminReply?: string;

  @ApiPropertyOptional()
  adminReplyAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
