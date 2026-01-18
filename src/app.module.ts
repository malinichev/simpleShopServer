import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
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

    // Модули приложения будут добавлены здесь
    // AuthModule,
    // UsersModule,
    // ProductsModule,
    // CategoriesModule,
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
  providers: [],
})
export class AppModule {}