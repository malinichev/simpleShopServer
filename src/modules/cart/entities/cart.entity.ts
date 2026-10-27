import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { CartItemEntity } from './cart-item.entity';

@Entity('carts')
export class Cart extends BaseEntity {
  @Index()
  @Column('uuid', { nullable: true })
  userId?: string;

  @Index()
  @Column({ nullable: true })
  sessionId?: string;

  @OneToMany(() => CartItemEntity, (item) => item.cart, { cascade: true })
  items: CartItemEntity[];

  // Явный type обязателен: с union `string | null` reflect-metadata даёт
  // Object, и TypeORM не может вывести тип колонки
  @Column({ type: 'varchar', nullable: true })
  promoCode?: string | null;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v) || 0),
    },
  })
  promoDiscount?: number | null;

  @Index()
  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
