import type { Request } from 'express';
import type { AuditContext } from '@/modules/audit/entities/audit-log.entity';

/**
 * Контекст запроса для аудит-лога: request-id (pino-http), IP и UA.
 * Используется в контроллерах, где есть @Req().
 */
export function requestContext(req: Request): AuditContext {
  const withId = req as Request & { id?: string };
  const userAgent = req.headers['user-agent'];
  return {
    requestId: withId.id,
    ip: req.ip,
    userAgent: userAgent ? String(userAgent).slice(0, 512) : undefined,
  };
}
