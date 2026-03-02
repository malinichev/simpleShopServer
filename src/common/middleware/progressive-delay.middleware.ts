import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

@Injectable()
export class ProgressiveDelayMiddleware implements NestMiddleware {
  private readonly window: number;
  private readonly threshold: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.window = this.configService.get<number>('ddos.window', 10);
    this.threshold = this.configService.get<number>('ddos.threshold', 20);
    this.baseDelay = this.configService.get<number>('ddos.baseDelay', 100);
    this.maxDelay = this.configService.get<number>('ddos.maxDelay', 5000);
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Пропускаем health-check эндпоинты
    if (req.originalUrl.startsWith('/api/health')) {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ddos:${ip}`;

    try {
      const count = await this.redis.incr(key);

      // Устанавливаем TTL только при первом запросе в окне
      if (count === 1) {
        await this.redis.expire(key, this.window);
      }

      if (count > this.threshold) {
        const excess = count - this.threshold;
        const delay = Math.min(
          this.baseDelay * Math.pow(2, excess - 1),
          this.maxDelay,
        );

        res.setHeader('X-RateLimit-Delay', `${delay}ms`);

        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    } catch {
      // При ошибке Redis — пропускаем без задержки, чтобы не ломать работу сервера
    }

    next();
  }
}
