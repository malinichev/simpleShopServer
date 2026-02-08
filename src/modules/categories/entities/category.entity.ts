import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities/base.entity';

export interface SEO {
  title: string;
  description: string;
  keywords: string[];
}

@Entity('categories')
export class Category extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  image?: string;

  @Index()
  @Column({ nullable: true })
  parentId?: ObjectId;

  @Index()
  @Column({ default: 0 })
  order: number;

  @Column({ default: true })
  isActive: boolean;

  @Column('json', { nullable: true })
  seo?: SEO;

  // Virtual fields (not stored in DB)
  children?: Category[];
  productsCount?: number;
}
