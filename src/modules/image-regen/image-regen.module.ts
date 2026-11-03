import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ImageRegenJob } from './entities/image-regen-job.entity';
import { ImageRegenService } from './image-regen.service';
import { ImageRegenController } from './image-regen.controller';
import {
  IMAGE_GEN_DRIVER,
  ImageGenDriver,
} from './drivers/image-gen-driver.interface';
import { createImageGenDriver } from './drivers';
import { ProductsModule } from '@/modules/products/products.module';
import { SettingsModule } from '@/modules/settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImageRegenJob]),
    BullModule.registerQueue({ name: 'image-regen' }),
    ProductsModule,
    SettingsModule,
  ],
  controllers: [ImageRegenController],
  providers: [
    ImageRegenService,
    {
      // Условная регистрация драйвера по env (см. drivers/index.ts)
      provide: IMAGE_GEN_DRIVER,
      useFactory: (configService: ConfigService): ImageGenDriver | null =>
        createImageGenDriver(configService),
      inject: [ConfigService],
    },
  ],
  exports: [IMAGE_GEN_DRIVER, BullModule],
})
export class ImageRegenModule {}
