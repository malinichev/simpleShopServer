/**
 * Экспорт OpenAPI 3.0 контракта в корень монорепо (../../openapi.json + .yaml).
 * Фронты (admin/client) генерируют из него типы и хуки — см. ../CLAUDE.md.
 *
 * Требует поднятой dev-инфраструктуры (PostgreSQL + Redis):
 *   docker compose -f docker-compose.dev.yml up -d postgres redis
 * Запуск: pnpm openapi:export
 */
import '../src/bootstrap-env'; // side-effect: грузит .env ДО декораторов модулей (как main.ts)
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import * as yaml from 'js-yaml';
import { AppModule } from '../src/app.module';
import { createApiDocument } from '../src/config/swagger.config';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const document = createApiDocument(app);
    const monorepoRoot = resolve(__dirname, '..', '..');
    const json = JSON.stringify(document, null, 2) + '\n';
    writeFileSync(resolve(monorepoRoot, 'openapi.json'), json);
    writeFileSync(
      resolve(monorepoRoot, 'openapi.yaml'),
      (yaml as { dump: (obj: unknown) => string }).dump(document),
    );
    const pathCount = Object.keys(document.paths ?? {}).length;
    console.log(
      `✅ OpenAPI экспортирован: ${monorepoRoot}/openapi.json (${pathCount} путей)`,
    );
  } finally {
    await app.close();
  }
}

void main();
