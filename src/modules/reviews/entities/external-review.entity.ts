import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Product } from '@/modules/products/entities/product.entity';

/** Источник внешних отзывов (импорт через reviews-sync). */
export const EXTERNAL_REVIEW_SOURCE = 'sima-land' as const;

/**
 * Отзыв поставщика (Сима-ленд, item-comment API v3). Живёт отдельно от
 * first-party `reviews` (там обязательные userId/orderId и модерация):
 * внешние отзывы уже опубликованы у поставщика, у нас не редактируются —
 * только скрываются (isHidden). Склеиваются со своими в
 * ReviewsService.findByProduct.
 */
@Entity('external_reviews')
@Index(['productId'])
@Unique(['source', 'externalId'])
export class ExternalReview extends BaseEntity {
  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product?: Product;

  /** Откуда импортирован отзыв (пока только Сималенд). */
  @Column({ default: EXTERNAL_REVIEW_SOURCE })
  source: string;

  /** id отзыва у поставщика (item_comment.id) — ключ дедупа. */
  @Column('int')
  externalId: number;

  /** sid товара-представителя модели (артикул размера Сималенда). */
  @Column('int', { default: 0 })
  itemSid: number;

  @Column('int')
  rating: number;

  /** Имя автора у поставщика (анонимные — «Анонимно»). */
  @Column()
  authorName: string;

  @Column('text')
  message: string;

  /** Достоинства / недостатки (заполняются не всегда). */
  @Column('text', { nullable: true })
  pros?: string;

  @Column('text', { nullable: true })
  cons?: string;

  /** Ответ поставщика на отзыв (message_reply). */
  @Column('text', { nullable: true })
  reply?: string;

  /** Покупатель реально покупал товар у поставщика (has_item_purchased). */
  @Column({ default: false })
  isVerifiedPurchase: boolean;

  /** URL наших S3-зеркал фото отзыва (скачиваются синком). */
  @Column('text', { array: true, default: () => 'ARRAY[]::text[]' })
  images: string[];

  /** Скрытие админом (отзыв остаётся в БД, но не показывается). */
  @Index()
  @Column({ default: false })
  isHidden: boolean;

  /** Дата публикации отзыва у поставщика (created_at). */
  @Column('timestamp', { nullable: true })
  sourceCreatedAt?: Date | null;
}
