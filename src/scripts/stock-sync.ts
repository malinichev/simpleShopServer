/**
 * CLI синка остатков с Сималенда (cron на проде + ручной запуск).
 *
 *   pnpm stock-sync             # боевой прогон (пишет стоки + строку прогона)
 *   pnpm stock-sync -- --dry-run  # отчёт без записи (первый прогон на проде)
 *
 * STOCK_SYNC_SIDS="123,456"     # прогнать только указанные sid (диагностика/e2e)
 *
 * На проде запускается деплой-скриптом/cron'ом:
 *   node dist/scripts/stock-sync.js          (из /var/www/simple-shop-server/source)
 * Механика — как у export-openapi.ts: полный AppModule в CLI-контексте
 * (нужны ProductsRepository/Redis/Meili), env грузит bootstrap-env.
 */
import '../bootstrap-env'; // side-effect: грузит .env ДО декораторов модулей (как main.ts)
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StockSyncService } from '../modules/stock-sync/stock-sync.service';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(StockSyncService);
    const startedAt = Date.now();
    if (dryRun) {
      console.log('🔍 DRY-RUN синка остатков Сималенда (без записи в БД)…');
    } else {
      console.log('🔄 Синк остатков Сималенда…');
    }
    const summary = await service.runFromCli(dryRun);

    console.log('');
    console.log('Изменения (первые 50):');
    for (const c of summary.changes.slice(0, 50)) {
      console.log(`  ${c.sku}: ${c.from} → ${c.to}`);
    }
    if (summary.changes.length > 50) {
      console.log(`  … и ещё ${summary.changes.length - 50}`);
    }
    console.log('');
    console.log(
      `Итог: вариантов ${summary.totalVariants}, обновлено ${summary.updatedCount}` +
        ` (обнулено ${summary.zeroedCount}), без изменений ${summary.unchangedCount}` +
        `, ошибок ${summary.errorCount} за ${Math.round(summary.durationMs / 1000)}с` +
        ` (CLI ${Math.round((Date.now() - startedAt) / 1000)}с)`,
    );
    if (summary.errorCount > 0) {
      console.error(
        `⚠️  Прогоны с ошибками: ${summary.errorCount} — см. лог выше`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`❌ Синк не выполнен: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
