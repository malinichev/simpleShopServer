import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
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
  @Column('uuid', { nullable: true })
  parentId?: string;

  @ManyToOne(() => Category, (cat) => cat.children, { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent?: Category;

  @OneToMany(() => Category, (cat) => cat.parent)
  children?: Category[];

  @Index()
  @Column({ default: 0 })
  order: number;

  @Column({ default: true })
  isActive: boolean;

  @Column('jsonb', { nullable: true })
  seo?: SEO;

  // Virtual field (not stored in DB)
  productsCount?: number;
}
