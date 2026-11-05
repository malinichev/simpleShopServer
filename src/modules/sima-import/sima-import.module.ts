import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  SimaImportJob,
  SimaModelLink,
} from './entities/sima-import-job.entity';
import { SimaImportService } from './sima-import.service';
import { SimaImportController } from './sima-import.controller';
import { ModelLinksService } from './model-links.service';
import { UploadModule } from '@/modules/upload/upload.module';
import { ProductsModule } from '@/modules/products/products.module';
import { StockSyncModule } from '@/modules/stock-sync/stock-sync.module';

/**
 * Загрузка выгрузок Сималенда (кнопка «Загрузка с Сималенд» в админке):
 * парсинг cloudparser-CSV + склейка цветов скрейпом «Вариантов» +
 * фоновая джоба с фазовым прогрессом и отменой.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SimaImportJob, SimaModelLink]),
    BullModule.registerQueue({ name: 'sima-import' }),
    UploadModule,
    ProductsModule,
    StockSyncModule,
  ],
  controllers: [SimaImportController],
  providers: [SimaImportService, ModelLinksService],
  exports: [SimaImportService, ModelLinksService, TypeOrmModule],
})
export class SimaImportModule {}
