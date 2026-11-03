import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

/** Кто совершил действие. */
export enum AuditActorType {
  USER = 'user',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

/** Контекст HTTP-запроса, в котором произошло действие (для расследований). */
export interface AuditContext {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Журнал действий: кто, когда и что изменил (старое → новое значение).
 * Единый поток событий по заказам/платежам/админ-операциям — основа
 * расследования инцидентов («почему у заказа поменялся статус»).
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_entity', ['entity', 'entityId'])
@Index('IDX_audit_logs_actorId', ['actorId'])
@Index('IDX_audit_logs_createdAt', ['createdAt'])
export class AuditLog extends BaseEntity {
  @Column({
    type: 'enum',
    enum: AuditActorType,
    default: AuditActorType.SYSTEM,
  })
  actorType: AuditActorType;

  /** id пользователя/админа; для system — пусто. */
  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null;

  /** Событие: order.created, order.status_changed, payment.webhook, ... */
  @Column({ type: 'varchar', length: 64 })
  action: string;

  /** Сущность: order, payment, product, ... */
  @Column({ type: 'varchar', length: 32 })
  entity: string;

  @Column({ type: 'varchar', length: 64 })
  entityId: string;

  /** Значение до изменения (снимок ключевых полей). */
  @Column({ type: 'jsonb', nullable: true })
  before?: Record<string, unknown> | null;

  /** Значение после изменения. */
  @Column({ type: 'jsonb', nullable: true })
  after?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent?: string | null;
}
