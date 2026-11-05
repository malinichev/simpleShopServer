import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockSyncRun } from './entities/stock-sync-run.entity';
import { SimaLandClient } from './sima-land.client';
import { StockSyncService } from './stock-sync.service';
import { StockSyncController } from './stock-sync.controller';
import { ProductsModule } from '@/modules/products/products.module';
import { SearchModule } from '@/modules/search/search.module';

/** Синк остатков каталога SL-* с Сималендом (CLI cron + кнопка в админке). */
@Module({
  imports: [
    TypeOrmModule.forFeature([StockSyncRun]),
    ProductsModule,
    SearchModule,
  ],
  providers: [SimaLandClient, StockSyncService],
  controllers: [StockSyncController],
  exports: [StockSyncService, SimaLandClient],
})
export class StockSyncModule {}
