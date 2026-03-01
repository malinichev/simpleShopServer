import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Product } from './product.entity';

@Entity('product_variants')
export class ProductVariantEntity extends BaseEntity {
  @Index()
  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column()
  size: string;

  @Column()
  color: string;

  @Column()
  colorHex: string;

  @Column({ unique: true })
  sku: string;

  @Column({ default: 0 })
  stock: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => v === null ? null : parseFloat(v) || 0 } })
  price?: number;
}
