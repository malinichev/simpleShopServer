import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum ImageRegenJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Вариант, сгенерированный для одного исходного фото. */
export interface RegenVariant {
  url: string;
  thumbUrl: string;
}

/** Одна позиция job'а: исходное фото товара + результаты генерации. */
export interface RegenItem {
  sourceImageId: string;
  sourceUrl: string;
  variants: RegenVariant[];
  error?: string;
}

/**
 * Задача ИИ-регенерации фото товара (по образцу ImportJob):
 * создаётся POST /image-regen/jobs, обрабатывается воркером очереди
 * `image-regen`, статус админка опрашивает через GET /image-regen/jobs/:id.
 */
@Entity('image_regen_jobs')
@Index(['productId'])
export class ImageRegenJob extends BaseEntity {
  @Column({
    type: 'enum',
    enum: ImageRegenJobStatus,
    default: ImageRegenJobStatus.PENDING,
  })
  status: ImageRegenJobStatus;

  @Column('uuid')
  productId: string;

  /** Промпт, введённый администратором (сцена). */
  @Column('text')
  prompt: string;

  /** Полный промпт: базовый стиль (настройки) + сцена + тех-суффикс. */
  @Column('text', { default: '' })
  composedPrompt: string;

  /** Модель/драйвер генерации ('stub' | имя модели провайдера). */
  @Column({ default: '' })
  model: string;

  @Column('jsonb', { default: [] })
  items: RegenItem[];

  @Column({ default: 0 })
  totalImages: number;

  @Column({ default: 0 })
  processedImages: number;

  @Column({ default: 0 })
  successCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column('jsonb', { default: [] })
  errors: Array<{ sourceImageId?: string; message: string }>;

  @Column('uuid')
  createdBy: string;
}
