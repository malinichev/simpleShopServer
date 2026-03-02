import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config({ path: '.env.development' });
config({ path: '.env' });
import { seedUsers } from './users.seed';
import { seedCategories } from './categories.seed';
import { seedProducts } from './products.seed';
import { seedPromotions } from './promotions.seed';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'sports-shop',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  synchronize: true,
});

async function runSeeds(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  try {
    await dataSource.initialize();
    console.log('Connected to database\n');

    // Clear all tables respecting FK constraints
    const tables = [
      'analytics_daily', 'page_files', 'pages', 'payment_methods', 'shipping_methods', 'settings',
      'reviews', 'order_items', 'cart_items', 'carts', 'orders',
      'product_variants', 'products', 'categories', 'promotions', 'users',
    ];
    for (const table of tables) {
      try {
        await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch {
        // Table may not exist yet on first run (synchronize will create it)
      }
    }
    console.log('Cleared all tables\n');

    console.log('[1/4] Seeding users...');
    await seedUsers(dataSource);
    console.log('');

    console.log('[2/4] Seeding categories...');
    const categoryMap = await seedCategories(dataSource);
    console.log('');

    console.log('[3/4] Seeding products...');
    await seedProducts(dataSource, categoryMap);
    console.log('');

    console.log('[4/4] Seeding promotions...');
    await seedPromotions(dataSource);
    console.log('');

    console.log('✅ Seeds completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runSeeds();
