import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum StockSyncRunStatus {
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

/** Кто запустил прогон: кнопка в админке / CLI (cron или руками). */
export enum StockSyncTrigger {
  MANUAL = 'manual',
  CLI = 'cli',
}

export interface StockSyncError {
  sku: string;
  error: string;
}

/**
 * Прогон синка остатков с Сималенда. Строка создаётся в статусе running
 * (POST /stock-sync/run или CLI) и закрывается по завершении; админка
 * опрашивает статус. Последний успешный startedAt — якорь для вычета
 * «продажи с прошлого прогона».
 */
@Entity('stock_sync_runs')
@Index(['startedAt'])
export class StockSyncRun extends BaseEntity {
  @Column({
    type: 'enum',
    enum: StockSyncRunStatus,
    default: StockSyncRunStatus.RUNNING,
  })
  status: StockSyncRunStatus;

  @Column({ default: StockSyncTrigger.MANUAL })
  trigger: StockSyncTrigger;

  @Column()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  /** Сколько SL-вариантов нашли в каталоге. */
  @Column({ default: 0 })
  totalVariants: number;

  /** Сколько уже обработали (для прогресса в админке). */
  @Column({ default: 0 })
  processedVariants: number;

  /** Сколько стоков изменилось. */
  @Column({ default: 0 })
  updatedCount: number;

  /** Из них обнулено (пропал у поставщика / balance < min_qty / вычет продаж). */
  @Column({ default: 0 })
  zeroedCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column('jsonb', { default: [] })
  errors: StockSyncError[];
}
