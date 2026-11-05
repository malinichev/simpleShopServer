import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsSyncRun } from './entities/reviews-sync-run.entity';
import { ReviewsSyncService } from './reviews-sync.service';
import { ReviewsSyncController } from './reviews-sync.controller';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';
import { ProductsModule } from '@/modules/products/products.module';
import { StockSyncModule } from '@/modules/stock-sync/stock-sync.module';
import { UploadModule } from '@/modules/upload/upload.module';
import { ReviewsModule } from '@/modules/reviews/reviews.module';

/** Синк отзывов поставщика (Сима-ленд) — ручной, кнопкой из админки. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReviewsSyncRun, ProductVariantEntity]),
    ProductsModule,
    StockSyncModule,
    UploadModule,
    ReviewsModule,
  ],
  providers: [ReviewsSyncService],
  controllers: [ReviewsSyncController],
  exports: [ReviewsSyncService],
})
export class ReviewsSyncModule {}
