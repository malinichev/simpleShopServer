import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
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
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PagesModule } from './modules/pages/pages.module';
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
  ddosConfig,
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
        ddosConfig,
      ],

      envFilePath: ['.env.development', '.env.production', '.env'],
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
    AnalyticsModule,
    SettingsModule,
    PagesModule,
    JobsModule,
  ],
  controllers: [],
  providers: [
    // Redis-клиент для middleware (progressive delay)
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
          lazyConnect: true,
        });
      },
      inject: [ConfigService],
    },
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

// export class AppModule implements NestModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer.apply(ProgressiveDelayMiddleware).forRoutes('*path');
//   }
// }
