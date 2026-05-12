import { registerAs } from '@nestjs/config';

/**
 * Redis настройки. Если REDIS_HOST не задан → host = undefined,
 * BullMQ-очереди не используются (см. mail.service.ts queueEnabled flag).
 * Это позволяет шаблону работать без Redis на template-первом-запуске.
 */
export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST?.trim() || undefined,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
}));
