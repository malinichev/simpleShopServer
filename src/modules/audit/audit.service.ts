import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditActorType,
  AuditContext,
  AuditLog,
} from './entities/audit-log.entity';
import { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  context?: AuditContext;
}

/**
 * Запись действий в audit_logs. Специально «небьющий»: ошибка записи аудита
 * логируется, но никогда не роняет бизнес-операцию (заказ/платёж важнее).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      const row = this.auditRepository.create({
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        requestId: entry.context?.requestId ?? null,
        ip: entry.context?.ip ?? null,
        userAgent: entry.context?.userAgent ?? null,
      });
      await this.auditRepository.save(row);
    } catch (error) {
      this.logger.error(
        `Аудит не записан (${entry.entity}:${entry.entityId} ${entry.action}): ${(error as Error).message}`,
      );
    }
  }

  /** Список событий для админки: фильтры + пагинация, новые сверху. */
  async find(query: AuditQueryDto): Promise<{
    data: AuditLog[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, string> = {};
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;

    const [data, total] = await this.auditRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return { data, total, limit: query.limit, offset: query.offset };
  }
}
