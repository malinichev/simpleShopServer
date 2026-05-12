import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '@/modules/products/entities/product.entity';
import { SearchService } from './search.service';
import {
  MeiliSearchDriver,
  PostgresSearchDriver,
  SEARCH_DRIVER,
  SearchDriver,
} from './drivers';

/**
 * Регистрирует SearchDriver по env `SEARCH_DRIVER`.
 *
 *   postgres (default) — без зависимостей, ILIKE по name/description.
 *   meilisearch        — stub. Требует `MEILISEARCH_HOST` env + доинтеграции
 *                        (см. meilisearch.driver.ts).
 *
 * Подключается в `app.module.ts`, реэкспортирует `SearchService` для
 * `ProductsModule` (поиск + hooks для индексации).
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Product])],
  providers: [
    PostgresSearchDriver,
    {
      provide: SEARCH_DRIVER,
      useFactory: (
        configService: ConfigService,
        postgresDriver: PostgresSearchDriver,
      ): SearchDriver => {
        const logger = new Logger('SearchDriverFactory');
        const driverName = (
          configService.get<string>('search.driver') || 'postgres'
        ).toLowerCase();

        switch (driverName) {
          case 'meilisearch': {
            if (!configService.get<string>('search.meilisearch.host')) {
              logger.warn(
                'SEARCH_DRIVER=meilisearch но MEILISEARCH_HOST пуст — fallback на postgres',
              );
              return postgresDriver;
            }
            logger.log('Search driver: MeiliSearch (stub, см. doc в драйвере)');
            return new MeiliSearchDriver(configService);
          }
          case 'postgres':
          default:
            logger.log('Search driver: Postgres ILIKE (default)');
            return postgresDriver;
        }
      },
      inject: [ConfigService, PostgresSearchDriver],
    },
    SearchService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
