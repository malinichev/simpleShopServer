import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum ReviewsSyncRunStatus {
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export enum ReviewsSyncTrigger {
  MANUAL = 'manual',
  CLI = 'cli',
}

export interface ReviewsSyncError {
  product: string;
  error: string;
}

/**
 * Прогон синка отзывов с Сималенда (ручной: кнопка в админке или CLI).
 * Строка создаётся в статусе running и закрывается по завершении;
 * админка опрашивает статус. Cron для отзывов не используется —
 * только ручные прогоны (расход запросов к API поставщика под контролем).
 */
@Entity('reviews_sync_runs')
@Index(['startedAt'])
export class ReviewsSyncRun extends BaseEntity {
  @Column({
    type: 'enum',
    enum: ReviewsSyncRunStatus,
    default: ReviewsSyncRunStatus.RUNNING,
  })
  status: ReviewsSyncRunStatus;

  @Column({ default: ReviewsSyncTrigger.MANUAL })
  trigger: ReviewsSyncTrigger;

  @Column()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  /** Сколько товаров (моделей SL-*) нашли в каталоге. */
  @Column({ default: 0 })
  totalProducts: number;

  /** Сколько уже обработали (для прогресса в админке). */
  @Column({ default: 0 })
  processedProducts: number;

  /** У скольких товаров оказались отзывы. */
  @Column({ default: 0 })
  productsWithComments: number;

  /** Новых отзывов импортировано. */
  @Column({ default: 0 })
  importedCount: number;

  /** Существующих отзывов обновлено (текст/рейтинг/фото). */
  @Column({ default: 0 })
  updatedCount: number;

  /** Отзывов удалено (пропали у поставщика). */
  @Column({ default: 0 })
  removedCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column('jsonb', { default: [] })
  errors: ReviewsSyncError[];
}
