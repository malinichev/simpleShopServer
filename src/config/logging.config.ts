import { registerAs } from '@nestjs/config';

/**
 * Логирование: уровень задаётся LOG_LEVEL (trace|debug|info|warn|error|fatal).
 * Прод — info (HTTP-строки на info, 4xx — warn, 5xx — error), dev — debug.
 */
export default registerAs('logging', () => ({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
}));
