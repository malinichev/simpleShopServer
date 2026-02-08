import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities/base.entity';

export interface CartItem {
  productId: ObjectId;
  variantId: string;
  quantity: number;
  price: number;
  addedAt: Date;
}

@Entity('carts')
export class Cart extends BaseEntity {
  @Index()
  @Column({ nullable: true })
  userId?: ObjectId;

  @Index()
  @Column({ nullable: true })
  sessionId?: string;

  @Column('json', { default: [] })
  items: CartItem[];

  @Column({ nullable: true })
  promoCode?: string;

  @Column('decimal', { nullable: true })
  promoDiscount?: number;

  @Index()
  @Column()
  expiresAt: Date;
}
