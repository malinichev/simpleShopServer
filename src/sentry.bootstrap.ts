/**
 * Sentry opt-in инициализация.
 *
 * Активация (3 шага):
 *   1. pnpm add @sentry/node @sentry/profiling-node
 *   2. Раскомментировать import + Sentry.init ниже
 *   3. SENTRY_DSN=https://...@sentry.io/... в .env
 *
 * Если SENTRY_DSN не задан — модуль ничего не делает, бэк работает как есть.
 *
 * Должен импортироваться ПЕРВОЙ строкой в main.ts (после bootstrap-env),
 * до NestFactory.create — для перехвата ошибок инициализации.
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  // ─── Раскомментировать после установки @sentry/node ───
  //
  // import * as Sentry from '@sentry/node';
  // import { nodeProfilingIntegration } from '@sentry/profiling-node';
  //
  // Sentry.init({
  //   dsn,
  //   environment: process.env.NODE_ENV || 'development',
  //   release: process.env.SENTRY_RELEASE,
  //   tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  //   profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  //   integrations: [nodeProfilingIntegration()],
  // });
  //
  // console.log('[sentry] initialized');
  //
  // ───────────────────────────────────────────────────────

  // eslint-disable-next-line no-console
  console.warn(
    '[sentry] SENTRY_DSN задан, но @sentry/node не установлен. ' +
      'Установи пакет и раскомментируй блок Sentry.init в server/src/sentry.bootstrap.ts.',
  );
}
