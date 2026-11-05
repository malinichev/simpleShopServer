/**
 * CLI синка отзывов с Сималенда (ручной запуск/бэкфилл; cron не используется).
 *
 *   pnpm reviews-sync               # боевой прогон (пишет отзывы + строку прогона)
 *   pnpm reviews-sync -- --dry-run  # прочитать API без записи в БД
 *
 * REVIEWS_SYNC_SIDS="123,456"       # прогнать только модели с этим sid (диагностика/e2e)
 */
import '../bootstrap-env'; // side-effect: грузит .env ДО декораторов модулей (как main.ts)
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ReviewsSyncService } from '../modules/reviews-sync/reviews-sync.service';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(ReviewsSyncService);
    console.log(
      dryRun
        ? '🔍 DRY-RUN синка отзывов Сималенда (без записи в БД)…'
        : '🔄 Синк отзывов Сималенда…',
    );
    const summary = await service.runFromCli(dryRun);
    console.log(
      `Итог: товаров ${summary.totalProducts}, с отзывами ${summary.productsWithComments}` +
        `, импортировано ${summary.importedCount}, обновлено ${summary.updatedCount}` +
        `, удалено ${summary.removedCount}, ошибок ${summary.errorCount}` +
        ` за ${Math.round(summary.durationMs / 1000)}с`,
    );
    if (summary.errorCount > 0) {
      console.error(`⚠️  Есть ошибки: ${summary.errorCount} — см. строку прогона в админке`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`❌ Синк отзывов не выполнен: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
