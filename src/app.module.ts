import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { UploadModule } from './modules/upload/upload.module';
import { CartModule } from './modules/cart/cart.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { MailModule } from './modules/mail/mail.module';
import { JobsModule } from './jobs/jobs.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import {
  configuration,
  appConfig,
  databaseConfig,
  jwtConfig,
  redisConfig,
  s3Config,
  mailConfig,
  throttleConfig,
} from './config';

@Module({
  imports: [
    // Конфигурация
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        configuration,
        appConfig,
        databaseConfig,
        jwtConfig,
        redisConfig,
        s3Config,
        mailConfig,
        throttleConfig,
      ],

      envFilePath: ['.env.development', '.env'],
    }),

    // BullMQ (очереди задач)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000,
            limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
          },
        ],
      }),
    }),

    // База данных
    DatabaseModule,

    // Health checks
    HealthModule,

    // Модули приложения
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    UploadModule,
    CartModule,
    PromotionsModule,
    OrdersModule,
    ReviewsModule,
    WishlistModule,
    MailModule,
    JobsModule,
  ],
  controllers: [],
  providers: [
    // Глобальный guard для JWT аутентификации
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Глобальный guard для проверки ролей
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}