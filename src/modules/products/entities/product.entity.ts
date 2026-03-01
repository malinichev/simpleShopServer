import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Category } from '@/modules/categories/entities/category.entity';
import { ProductVariantEntity } from './product-variant.entity';

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  OUT_OF_STOCK = 'out_of_stock',
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  order: number;
}

export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  stock: number;
  price?: number;
}

export interface ProductAttributes {
  material: string;
  activity: string[];
  features: string[];
  careInstructions?: string;
}

export interface ProductSEO {
  title: string;
  description: string;
  keywords: string[];
}

@Entity('products')
export class Product extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column('text')
  description: string;

  @Column()
  shortDescription: string;

  @Column({ unique: true })
  sku: string;

  @Index()
  @Column('decimal', { precision: 10, scale: 2, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) || 0 } })
  price: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, transformer: { to: (v: number | null) => v, from: (v: string | null) => v === null ? null : parseFloat(v) || 0 } })
  compareAtPrice?: number;

  @Index()
  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'categoryId' })
  category?: Category;

  @Column('text', { array: true, default: () => "ARRAY[]::text[]" })
  tags: string[];

  @Column('jsonb', { default: [] })
  images: ProductImage[];

  @OneToMany(() => ProductVariantEntity, (variant) => variant.product, { cascade: true })
  variants: ProductVariantEntity[];

  @Column('jsonb', { default: {} })
  attributes: ProductAttributes;

  @Column('decimal', { precision: 3, scale: 2, default: 0, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) || 0 } })
  rating: number;

  @Column({ default: 0 })
  reviewsCount: number;

  @Column({ default: 0 })
  soldCount: number;

  @Index()
  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column('jsonb', { default: {} })
  seo: ProductSEO;

  @Column({ default: true })
  isVisible: boolean;
}
