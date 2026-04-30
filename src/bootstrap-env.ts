import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Side-effect модуль: загружает .env файл в process.env ДО того, как Nest
 * начнёт резолвить декораторы модулей.
 *
 * Зачем: некоторые модули (auth.module conditional registration) читают
 * process.env прямо в @Module() decorator. К моменту evaluation декоратора
 * (это import-time) ConfigModule.forRoot ещё не успел запуститься, поэтому
 * env-переменные из файлов недоступны без этого preload.
 *
 * Должен импортироваться ПЕРВОЙ строкой в main.ts (до AppModule).
 *
 * Порядок такой же как в ConfigModule и data-source.ts:
 * .env.development → .env.production → .env (берётся первый существующий).
 */
for (const envFile of ['.env.development', '.env.production', '.env']) {
  const path = resolve(process.cwd(), envFile);
  if (existsSync(path)) {
    dotenvConfig({ path });
    break;
  }
}
