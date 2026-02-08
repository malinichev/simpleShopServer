import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities/base.entity';

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
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
  @Column('decimal')
  price: number;

  @Column('decimal', { nullable: true })
  compareAtPrice?: number;

  @Index()
  @Column()
  categoryId: ObjectId;

  @Column('simple-array', { default: [] })
  tags: string[];

  @Column('json', { default: [] })
  images: ProductImage[];

  @Column('json', { default: [] })
  variants: ProductVariant[];

  @Column('json')
  attributes: ProductAttributes;

  @Column('decimal', { default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewsCount: number;

  @Column({ default: 0 })
  soldCount: number;

  @Index()
  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column('json')
  seo: ProductSEO;

  @Column({ default: true })
  isVisible: boolean;
}
