import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities/base.entity';

@Entity('reviews')
@Index(['productId', 'userId'], { unique: true })
export class Review extends BaseEntity {
  @Index()
  @Column()
  productId: ObjectId;

  @Index()
  @Column()
  userId: ObjectId;

  @Column()
  orderId: ObjectId;

  @Index()
  @Column({ type: 'int' })
  rating: number;

  @Column({ nullable: true })
  title?: string;

  @Column('text')
  text: string;

  @Column('simple-array', { default: [] })
  images: string[];

  @Index()
  @Column({ default: false })
  isApproved: boolean;

  @Column({ nullable: true })
  adminReply?: string;

  @Column({ nullable: true })
  adminReplyAt?: Date;
}
