import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Index('cart_items_cart_variant_uniq', ['cartId', 'variantId'], { unique: true })
export class CartItemEntity extends BaseEntity {
  @Index()
  @Column('uuid')
  cartId: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart?: Cart;

  @Column('uuid')
  productId: string;

  @Column()
  variantId: string;

  @Column()
  quantity: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  price: number;

  // addedAt = createdAt (inherited from BaseEntity)
}
