import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export interface PageFile {
  key: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
}

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

  @Column('json', { default: [] })
  files: PageFile[];

  @Column({ default: false })
  isPublished: boolean;
}
