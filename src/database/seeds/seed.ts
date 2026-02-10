import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { seedUsers } from './users.seed';
import { seedCategories } from './categories.seed';
import { seedProducts } from './products.seed';
import { seedPromotions } from './promotions.seed';

const dataSource = new DataSource({
  type: 'mongodb',
  url: process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-shop',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  synchronize: false,
});

async function runSeeds(): Promise<void> {
  console.log('🌱 Starting database seed...\n');

  try {
    await dataSource.initialize();
    console.log('Connected to database\n');

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
