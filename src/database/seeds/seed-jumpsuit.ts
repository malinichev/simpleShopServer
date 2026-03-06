/**
 * Скрипт: создать 1 модель "Комбинезон" в 3 цветах (3 product-а с общим modelId)
 *
 * Запуск из server/:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jumpsuit.ts
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Product, ProductStatus } from '@/modules/products/entities/product.entity';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';
import { Category } from '@/modules/categories/entities/category.entity';

dotenv.config({ path: '.env.development' });
dotenv.config({ path: '.env' });

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

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

const COLORS = [
  {
    name: 'черный',
    hex: '#000000',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
  },
  {
    name: 'розовый',
    hex: '#FFC0CB',
    image: 'https://images.unsplash.com/photo-1518577915332-c2a19f149a75?w=800&q=80',
  },
  {
    name: 'серый',
    hex: '#808080',
    image: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800&q=80',
  },
];

async function run() {
  console.log('🔌 Подключение к БД...');
  await dataSource.initialize();
  console.log('✅ Подключено\n');

  const categoryRepo = dataSource.getRepository(Category);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariantEntity);

  // 1. Найти или создать категорию «Комбинезоны»
  let category = await categoryRepo.findOne({ where: { slug: 'jumpsuits' } });
  if (!category) {
    console.log('📁 Категория "Комбинезоны" не найдена — создаю...');
    category = await categoryRepo.save(
      categoryRepo.create({
        name: 'Комбинезоны',
        slug: 'jumpsuits',
        description: 'Спортивные комбинезоны для тренировок и повседневной носки',
        order: 9,
        isActive: true,
      }),
    );
    console.log(`   Создана категория: ${category.name} (${category.id})\n`);
  } else {
    console.log(`📁 Категория найдена: ${category.name} (${category.id})\n`);
  }

  // 2. Общий modelId для всех 3 цветов
  const modelId = uuidv4();
  console.log(`🎨 Model ID: ${modelId}\n`);

  const createdProducts: Product[] = [];

  for (let i = 0; i < COLORS.length; i++) {
    const color = COLORS[i];
    const isFirst = i === 0;
    const suffix = color.name.slice(0, 3).toUpperCase();

    const productData: Partial<Product> = {
      name: isFirst ? 'Комбинезон спортивный FlexOne' : `Комбинезон спортивный FlexOne (${color.name})`,
      slug: isFirst ? 'jumpsuit-flexone' : `jumpsuit-flexone-${color.name}`,
      description:
        'Стильный спортивный комбинезон с молнией спереди. Эластичная ткань обеспечивает свободу движений. ' +
        'Широкий пояс с регулировкой подчёркивает фигуру. Подходит для йоги, пилатеса и повседневной носки.',
      shortDescription: 'Спортивный комбинезон с молнией и широким поясом',
      sku: isFirst ? 'JS-FLX-01' : `JS-FLX-01-${suffix}`,
      price: 5900,
      compareAtPrice: 7200,
      categoryId: category.id,
      tags: ['комбинезон', 'новинка', 'бестселлер'],
      color: color.name,
      colorHex: color.hex,
      modelId,
      images: [
        {
          id: `js-${color.name}-1`,
          url: color.image,
          alt: `Комбинезон FlexOne — ${color.name}`,
          order: 0,
        },
      ],
      attributes: {
        material: '75% нейлон, 25% спандекс',
        activity: ['yoga', 'casual'],
        features: ['Молния спереди', 'Широкий пояс', 'Эластичная ткань', 'Карманы'],
      },
      rating: 0,
      reviewsCount: 0,
      soldCount: 0,
      status: ProductStatus.ACTIVE,
      isVisible: true,
      seo: {
        title: isFirst ? 'Комбинезон спортивный FlexOne' : `Комбинезон FlexOne (${color.name})`,
        description: 'Спортивный комбинезон с молнией и широким поясом',
        keywords: ['комбинезон', 'спортивный', color.name],
      },
    };

    const product = await productRepo.save(productRepo.create(productData));
    createdProducts.push(product);

    // Варианты — только размеры
    const variants = SIZES.map((size) =>
      variantRepo.create({
        productId: product.id,
        size,
        sku: `${product.sku}-${size}`,
        stock: Math.floor(Math.random() * 30) + 5,
        price: 5900,
      }),
    );
    await variantRepo.save(variants);

    console.log(`  ✅ ${product.name}`);
    console.log(`     slug: ${product.slug}`);
    console.log(`     цвет: ${color.name} (${color.hex})`);
    console.log(`     вариантов: ${variants.length}`);
    console.log('');
  }

  console.log('─────────────────────────────────────');
  console.log(`✅ Создано ${createdProducts.length} товара с modelId = ${modelId}`);
  console.log('   Все связаны как цветовые сиблинги.\n');

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
