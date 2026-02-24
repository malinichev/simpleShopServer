import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

@Entity('page_files')
export class PageFileRecord extends BaseEntity {
  @Column()
  key: string;

  @Column()
  url: string;

  @Column()
  name: string;

  @Column()
  size: number;

  @Column()
  mimeType: string;
}
