import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

@Entity('pages')
export class Page extends BaseEntity {
  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  metaTitle: string;

  @Column({ nullable: true })
  metaDescription: string;

  @Column('json', { default: {} })
  content: object;

  @Column({ default: false })
  isPublished: boolean;
}
