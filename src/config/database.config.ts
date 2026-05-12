import { registerAs } from '@nestjs/config';
import { URL } from 'url';

/**
 * Database настройки. Поддерживает 2 формата:
 *   1. DATABASE_URL=postgres://user:pass@host:5432/db (стандарт для Cloud — Neon/Supabase/Railway/Heroku)
 *   2. Отдельные DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_DATABASE (legacy)
 *
 * Если задан DATABASE_URL — он имеет приоритет.
 */
export default registerAs('database', () => {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ''),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'sports-shop',
  };
});
