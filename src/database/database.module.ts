import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('nodeEnv') === 'production';
        return {
          type: 'postgres' as const,
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          synchronize: !isProd,
          logging: !isProd,
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsTableName: 'typeorm_migrations',
          // На прод миграции запускаются через `pnpm migration:run`, а НЕ
          // автоматически при старте приложения — иначе несколько PM2-процессов
          // или хот-restart могут попытаться накатить параллельно.
          migrationsRun: false,
          // Beget managed-PG использует self-signed CA → rejectUnauthorized=false.
          // Трафик шифруется (TLS 1.3), но identity chain не верифицируется.
          ssl: isProd ? { rejectUnauthorized: false } : false,
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
