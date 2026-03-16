import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';

export enum MarkingCodeStatus {
  IN_STOCK = 'in_stock',
  RESERVED = 'reserved',
  SOLD = 'sold',
  RETURNED = 'returned',
  WRITTEN_OFF = 'written_off',
}

@Entity('marking_codes')
export class MarkingCode extends BaseEntity {
  @Column('uuid')
  @Index()
  variantId: string;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariantEntity;

  @Column({ unique: true })
  code: string;

  @Column({ default: '' })
  gtin: string;

  @Column({ default: '' })
  serial: string;

  @Column({
    type: 'enum',
    enum: MarkingCodeStatus,
    default: MarkingCodeStatus.IN_STOCK,
  })
  @Index()
  status: MarkingCodeStatus;

  @Column('uuid', { nullable: true })
  orderId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  statusChangedAt: Date | null;
}
