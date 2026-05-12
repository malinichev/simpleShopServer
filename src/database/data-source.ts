import 'dotenv/config';
import { DataSource } from 'typeorm';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { URL } from 'url';

/**
 * Standalone DataSource для TypeORM CLI (migration:generate / migration:run).
 * Не использует Nest IoC. Читает env напрямую: пробует .env.development, затем
 * .env.production, затем .env (тот же порядок что и Nest ConfigModule).
 *
 * Поддерживает DATABASE_URL (приоритет) и отдельные DB_* переменные (fallback).
 */
for (const envFile of ['.env.development', '.env.production', '.env']) {
  const path = resolve(process.cwd(), envFile);
  if (existsSync(path)) {
    dotenvConfig({ path });
    break;
  }
}

const isProd = process.env.NODE_ENV === 'production';

function buildDbConfig() {
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
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...buildDbConfig(),
  ssl: isProd ? { rejectUnauthorized: false } : false,
  entities: [resolve(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [resolve(__dirname, 'migrations/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  logging: ['error', 'warn'],
});
