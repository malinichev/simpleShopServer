import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import { seedUsers } from './users.seed';
import { seedCategories } from './categories.seed';
import { seedProducts } from './products.seed';
import { seedPromotions } from './promotions.seed';
import { seedOrders } from './orders.seed';
import { seedAnalytics } from './analytics.seed';
import { seedLegalPages } from './legal-pages.seed';

dotenv.config({ path: '.env.development' });

dotenv.config({ path: '.env' });

// Защита от случайного запуска в prod: seed TRUNCATE-ит все таблицы
// и использует synchronize: true (перезапишет схему).
// Чтобы запустить против prod-БД сознательно — выставить FORCE_PROD_SEED=yes.
if (
  process.env.NODE_ENV === 'production' &&
  process.env.FORCE_PROD_SEED !== 'yes'
) {
  console.error(
    '❌ Refusing to run seed in NODE_ENV=production. ' +
      'Set FORCE_PROD_SEED=yes if you REALLY mean it (it will DROP data).',
  );
  process.exit(1);
}

const isProd = process.env.NODE_ENV === 'production';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'sports-shop',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  synchronize: !isProd,
  ssl: isProd ? { rejectUnauthorized: false } : false,
});

async function runSeeds(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  try {
    await dataSource.initialize();
    console.log('Connected to database\n');

    // Clear all tables respecting FK constraints
    const tables = [
      'analytics_daily',
      'page_files',
      'pages',
      'payment_methods',
      'shipping_methods',
      'settings',
      'reviews',
      'order_items',
      'cart_items',
      'carts',
      'orders',
      'product_variants',
      'products',
      'categories',
      'promotions',
      'users',
    ];
    for (const table of tables) {
      try {
        await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch {
        // Table may not exist yet on first run (synchronize will create it)
      }
    }
    console.log('Cleared all tables\n');

    console.log('[1/7] Seeding users...');
    await seedUsers(dataSource);
    console.log('');

    console.log('[2/7] Seeding categories...');
    const categoryMap = await seedCategories(dataSource);
    console.log('');

    console.log('[3/7] Seeding products...');
    await seedProducts(dataSource, categoryMap);
    console.log('');

    console.log('[4/7] Seeding orders (60 days back)...');
    await seedOrders(dataSource);
    console.log('');

    console.log('[5/7] Seeding analytics aggregates...');
    await seedAnalytics(dataSource);
    console.log('');

    console.log('[6/7] Seeding promotions...');
    await seedPromotions(dataSource);
    console.log('');

    console.log('[7/7] Seeding legal pages (privacy/terms/etc)...');
    await seedLegalPages(dataSource);
    console.log('');

    console.log('✅ Seeds completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

void runSeeds();
