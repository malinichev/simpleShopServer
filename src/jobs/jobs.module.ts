import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '@/modules/mail/mail.module';
import { AnalyticsModule } from '@/modules/analytics/analytics.module';
import { ProductsModule } from '@/modules/products/products.module';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { UploadModule } from '@/modules/upload/upload.module';
import { ImportJob } from '@/modules/import/entities/import-job.entity';
import { ImageRegenJob } from '@/modules/image-regen/entities/image-regen-job.entity';
import { ImageRegenModule } from '@/modules/image-regen/image-regen.module';
import { EmailProcessor } from './processors/email.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { ImportProcessor } from './processors/import.processor';
import { ImageRegenProcessor } from './processors/image-regen.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'image-processing' },
      { name: 'analytics' },
      { name: 'import' },
      { name: 'image-regen' },
    ),
    TypeOrmModule.forFeature([ImportJob, ImageRegenJob]),
    MailModule,
    forwardRef(() => AnalyticsModule),
    ProductsModule,
    CategoriesModule,
    UploadModule,
    ImageRegenModule,
  ],
  providers: [EmailProcessor, AnalyticsProcessor, ImportProcessor, ImageRegenProcessor],
  exports: [BullModule],
})
export class JobsModule {}
