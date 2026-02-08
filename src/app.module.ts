import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
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
    // OrdersModule,
    // CartModule,
    // ReviewsModule,
    // PromotionsModule,
    // WishlistModule,
    // UploadModule,
    // MailModule,
    // AnalyticsModule,
    // HealthModule,
    // JobsModule,
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