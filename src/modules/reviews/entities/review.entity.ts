import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Order } from '@/modules/orders/entities/order.entity';

@Entity('reviews')
@Index(['productId', 'userId'], { unique: true })
export class Review extends BaseEntity {
  @Index()
  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index()
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Index()
  @Column({ type: 'int' })
  rating: number;

  @Column({ nullable: true })
  title?: string;

  @Column('text')
  text: string;

  @Column('text', { array: true, default: () => "ARRAY[]::text[]" })
  images: string[];

  @Column({ default: false })
  isAnonymous: boolean;

  @Index()
  @Column({ default: false })
  isApproved: boolean;

  @Column({ nullable: true })
  adminReply?: string;

  @Column({ type: 'timestamp', nullable: true })
  adminReplyAt?: Date;
}
