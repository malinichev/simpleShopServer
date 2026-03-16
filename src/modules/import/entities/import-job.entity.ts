import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum ImportJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('import_jobs')
export class ImportJob extends BaseEntity {
  @Column({ type: 'enum', enum: ImportJobStatus, default: ImportJobStatus.PENDING })
  status: ImportJobStatus;

  @Column()
  fileName: string;

  @Column()
  fileKey: string;

  @Column({ default: 0 })
  totalRows: number;

  @Column({ default: 0 })
  processedRows: number;

  @Column({ default: 0 })
  successCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column('jsonb', { default: [] })
  errors: Array<{ row: number; field?: string; message: string }>;

  @Column('jsonb', { default: {} })
  columnMapping: Record<string, string>;

  @Column('uuid')
  createdBy: string;
}
