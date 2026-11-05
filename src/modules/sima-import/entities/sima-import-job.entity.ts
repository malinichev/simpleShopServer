import { Entity, Column, Index, PrimaryColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum SimaImportJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/** Фазы фоновой загрузки: склейка (скрейп страниц) → зеркалирование картинок → товары. */
export enum SimaImportPhase {
  SCRAPE = 'scrape',
  IMAGES = 'images',
  PRODUCTS = 'products',
  DONE = 'done',
}

export interface SimaImportOptions {
  onlyWomen?: boolean;
}

@Entity('sima_import_jobs')
export class SimaImportJob extends BaseEntity {
  @Column({
    type: 'enum',
    enum: SimaImportJobStatus,
    default: SimaImportJobStatus.PENDING,
  })
  status: SimaImportJobStatus;

  @Column({
    type: 'enum',
    enum: SimaImportPhase,
    default: SimaImportPhase.SCRAPE,
  })
  phase: SimaImportPhase;

  @Column()
  fileName: string;

  @Column()
  fileKey: string;

  @Column('jsonb', { default: {} })
  options: SimaImportOptions;

  @Column({ default: 0 })
  totalItems: number;

  @Column({ default: 0 })
  processedItems: number;

  @Column({ default: 0 })
  scrapeTotal: number;

  @Column({ default: 0 })
  scrapeDone: number;

  @Column({ default: 0 })
  imagesTotal: number;

  @Column({ default: 0 })
  imagesDone: number;

  @Column({ default: 0 })
  createdCount: number;

  @Column({ default: 0 })
  updatedCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column('jsonb', { default: [] })
  errors: Array<{ row: string; message: string }>;

  @Column({ default: false })
  cancelRequested: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @Column('uuid')
  createdBy: string;
}

/** Кэш склейки цветов: sid → ключ модели (min sid компоненты «Вариантов»). */
@Entity('sima_model_links')
@Index('IDX_sima_model_links_modelKey', ['modelKey'])
export class SimaModelLink {
  @PrimaryColumn({
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  sid: number;

  @Column({
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  modelKey: number;

  @Column({ type: 'varchar', nullable: true })
  colorName: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  updatedAt: Date;
}
