import 'dotenv/config';
import { DataSource } from 'typeorm';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Standalone DataSource для TypeORM CLI (migration:generate / migration:run).
 * Не использует Nest IoC. Читает env напрямую: пробует .env.development, затем
 * .env.production, затем .env (тот же порядок что и Nest ConfigModule).
 */
for (const envFile of ['.env.development', '.env.production', '.env']) {
  const path = resolve(process.cwd(), envFile);
  if (existsSync(path)) {
    dotenvConfig({ path });
    break;
  }
}

const isProd = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  entities: [resolve(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [resolve(__dirname, 'migrations/*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  logging: ['error', 'warn'],
});
