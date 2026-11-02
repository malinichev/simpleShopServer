import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Глобальный rate-limit (регистрируется в app.module.ts, работает только в prod).
 *
 * Внешний трафик в prod всегда приходит через nginx и несёт X-Forwarded-For —
 * такие запросы троттлятся по реальному IP клиента. Локальные SSR-фетчи Next
 * (прямой 127.0.0.1:4000 без XFF) не троттлим: иначе ISR-рендеры каталога
 * collectively упрутся в один общий лимит и сломают витрину.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      ip?: string;
      headers: Record<string, unknown>;
    }>();
    const hasProxy = Boolean(req.headers['x-forwarded-for']);
    const isLoopback =
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1';
    if (isLoopback && !hasProxy) {
      return true;
    }
    return super.canActivate(context);
  }
}
