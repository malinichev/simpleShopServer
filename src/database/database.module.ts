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
          // Schema всегда через миграции — даже в dev. Так dev/prod схемы
          // всегда совпадают и не возникает ситуаций «локально работает, на проде падает».
          // Workflow миграций: docs/MIGRATIONS.md
          synchronize: false,
          logging: !isProd,
          entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsTableName: 'typeorm_migrations',
          // На прод миграции запускаются через `pnpm migration:run`, а НЕ
          // автоматически при старте приложения — иначе несколько PM2-процессов
          // или хот-restart могут попытаться накатить параллельно.
          migrationsRun: false,
          // SSL: включается только для удалённых БД (Beget).
          // Для локального Docker PostgreSQL SSL не нужен.
          ssl:
            isProd && configService.get<string>('database.host') !== '127.0.0.1'
              ? { rejectUnauthorized: false }
              : false,
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
