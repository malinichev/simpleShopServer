/**
 * Скрипт: полная замена каталога в проде (2026-08-11).
 *
 * Удаляет ВСЕ товары/категории/заказы (TRUNCATE CASCADE) и создаёт:
 *   - 3 категории (tops / leggings / sets)
 *   - 10 Product-строк (9 моделей, у leggings-shaping — 2 цвета с общим modelId)
 *   - 50 variants (каждый товар × XS-XL, stock=10)
 *   - 30 изображений уже загружены в SprintHost S3, проставлены public-read ACL.
 *
 * Фотографии лежат в бакете s3-952264 на SprintHost:
 *   https://s3.spb.sprinthost.ru/s3-952264/products/<model>/<color>-<n>.webp
 *
 * Запуск из server/ (локально или на сервере):
 *   FORCE_PROD_SEED=yes NODE_ENV=production \
 *     npx ts-node -r tsconfig-paths/register \
 *     src/database/seeds/presets/fashion/import-scripts/seed-catalog-2026-08.ts
 *
 * Защита от случайного прогона в prod: требует FORCE_PROD_SEED=yes при NODE_ENV=production.
 * Idempotent: повторный запуск сделает TRUNCATE + CREATE заново.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Product,
  ProductStatus,
} from '@/modules/products/entities/product.entity';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';
import { Category } from '@/modules/categories/entities/category.entity';

// .env.development (если есть) → .env (на сервере это симлинк на .env.production)
dotenv.config({ path: '.env.development' });
dotenv.config({ path: '.env' });

// ─── Защита от случайного запуска в prod ────────────────────────────────
if (
  process.env.NODE_ENV === 'production' &&
  process.env.FORCE_PROD_SEED !== 'yes'
) {
  console.error(
    '❌ Refusing to run catalog swap in NODE_ENV=production. ' +
      'Set FORCE_PROD_SEED=yes if you REALLY mean it (it will DROP all products, categories, orders).',
  );
  process.exit(1);
}

// ─── DataSource ─────────────────────────────────────────────────────────
// synchronize: false — миграции уже выполнены, схема не трогается.
// SSL отключён (локальный Docker postgres не поддерживает SSL).
// entities — абсолютный путь к src/, чтобы TypeORM нашёл все *.entity.ts
// независимо от cwd запуска ts-node.
const SRC_DIR = require('path').resolve(__dirname, '../../../../..');
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'sports-shop',
  entities: [SRC_DIR + '/**/*.entity{.ts,.js}'],
  synchronize: false,
  ssl: false,
});

// ─── Константы каталога ─────────────────────────────────────────────────
const S3_PUBLIC_URL =
  process.env.S3_PUBLIC_URL || 'https://s3.spb.sprinthost.ru';
const S3_BUCKET = process.env.S3_BUCKET || 's3-952264';

/** Полный публичный URL для S3-ключа (с bucket в пути — как getFileUrl в upload.service). */
function s3Url(key: string): string {
  return `${S3_PUBLIC_URL}/${S3_BUCKET}/${key}`;
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const STOCK = 10;

interface PhotoSet {
  /** slug модели, под которым лежат фото (напр. 'top-form') */
  folder: string;
  /** цвет в имени файла (напр. 'black') */
  colorFile: string;
}

interface ProductSpec {
  slug: string;
  name: string;
  /** slug категории */
  categorySlug: string;
  description: string;
  shortDescription: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  tags: string[];
  material: string;
  activity: string[];
  features: string[];
  /** цвет (русское название) */
  colorName: string;
  colorHex: string;
  /** файловая пара (folder/colorFile) для выбора фото из S3 */
  photo: PhotoSet;
  /** описание цвета в alt */
  isFirstColor?: boolean;
}

// ─── Спецификация из docs/PLAN_PRODUCT_GENERATION.md ────────────────────
// Общий modelId для leggings-shaping (2 цвета)
const SHAPING_MODEL_ID = uuidv4();

const PRODUCTS: ProductSpec[] = [
  {
    slug: 'top-form',
    name: 'Кроп-топ с длинным рукавом Form',
    categorySlug: 'tops',
    description:
      'Плотный кроп-топ с длинным рукавом и анатомической посадкой. ' +
      'Компрессионная ткань поддерживает мышцы во время тренировки, ' +
      'удлинённая база не задирается при движении. Подходит для йоги, ' +
      'тренировок в зале и как базовый слой в повседневных образах.',
    shortDescription: 'Кроп-топ с длинным рукавом для тренировок',
    sku: 'TOP-FORM-01',
    price: 2900,
    tags: ['топ', 'спорт', 'новинка'],
    material: '78% нейлон, 22% эластан',
    activity: ['yoga', 'gym', 'casual'],
    features: ['Компрессионная посадка', 'Удлинённая база', 'Плоские швы'],
    colorName: 'чёрный',
    colorHex: '#000000',
    photo: { folder: 'top-form', colorFile: 'black' },
    isFirstColor: true,
  },
  {
    slug: 'top-flow',
    name: 'Майка с открытой спиной Flow',
    categorySlug: 'tops',
    description:
      'Лёгкая спортивная майка с открытой спиной и тонкими бретелями. ' +
      'Дышащая влагоотводящая ткань сохраняет свежесть в жаркие дни. ' +
      'Элегантный крой с открытыми лопатками переходит из спортзала ' +
      'в повседневный образ.',
    shortDescription: 'Майка с открытой спиной для жарких тренировок',
    sku: 'TOP-FLOW-01',
    price: 2300,
    tags: ['топ', 'майка', 'лето'],
    material: '92% полиэстер, 8% эластан',
    activity: ['fitness', 'running', 'casual'],
    features: ['Открытая спина', 'Влагоотводящая ткань', 'Тонкие бретели'],
    colorName: 'белый',
    colorHex: '#FFFFFF',
    photo: { folder: 'top-flow', colorFile: 'white' },
    isFirstColor: true,
  },
  {
    slug: 'top-sculpt',
    name: 'Топ с V-образным вырезом Sculpt',
    categorySlug: 'tops',
    description:
      'Спортивный топ с V-образным вырезом и съёмными чашечками. ' +
      'Эластичная ткань моделирует силуэт, внутренние чашки дают поддержку ' +
      'без швов и резинок. Универсальный крой для среднеинтенсивных ' +
      'тренировок и активного отдыха.',
    shortDescription: 'Топ с V-вырезом и съёмными чашечками',
    sku: 'TOP-SCULPT-01',
    price: 2600,
    compareAtPrice: 3200,
    tags: ['топ', 'спорт', 'распродажа'],
    material: '75% полиамид, 25% эластан',
    activity: ['fitness', 'yoga', 'dance'],
    features: ['V-образный вырез', 'Съёмные чашечки', 'Бесшовная поддержка'],
    colorName: 'розовый',
    colorHex: '#FFC0CB',
    photo: { folder: 'top-sculpt', colorFile: 'pink' },
    isFirstColor: true,
  },
  // leggings-shaping: 2 цвета с общим modelId
  {
    slug: 'leggings-shaping',
    name: 'Леггинсы с контурной строчкой Shaping',
    categorySlug: 'leggings',
    description:
      'Высокие леггинсы с V-поясом и контурными швами, визуально моделирующими ' +
      'фигуру. Четырёхниточная эластичная ткань не просвечивает и не теряет ' +
      'формы после множества стирок. Идеальны для интенсивных тренировок ' +
      'и активного отдыха.',
    shortDescription: 'Леггинсы с контурными швами и V-поясом',
    sku: 'LG-SHAPING-01',
    price: 4800,
    tags: ['леггинсы', 'спорт', 'бестселлер'],
    material: '75% нейлон, 25% эластан',
    activity: ['fitness', 'gym', 'running'],
    features: ['V-пояс', 'Контурные швы', 'Непросвечивающая ткань', 'Высокая посадка'],
    colorName: 'чёрный',
    colorHex: '#000000',
    photo: { folder: 'leggings-shaping', colorFile: 'black' },
    isFirstColor: true,
  },
  {
    slug: 'leggings-shaping-Gray',
    name: 'Леггинсы с контурной строчкой Shaping (серые)',
    categorySlug: 'leggings',
    description:
      'Серая версия модели Shaping — высокие леггинсы с V-поясом и контурными ' +
      'швами. Тот же крой и та же компрессионная поддержка в меланжевом сером ' +
      'исполнении для тех, кто предпочитает светлые тона.',
    shortDescription: 'Серые леггинсы Shaping с V-поясом',
    sku: 'LG-SHAPING-01-GRAY',
    price: 4800,
    tags: ['леггинсы', 'спорт', 'бестселлер'],
    material: '75% нейлон, 25% эластан',
    activity: ['fitness', 'gym', 'running'],
    features: ['V-пояс', 'Контурные швы', 'Непросвечивающая ткань', 'Высокая посадка'],
    colorName: 'серый',
    colorHex: '#808080',
    photo: { folder: 'leggings-shaping', colorFile: 'grey' },
    isFirstColor: false,
  },
  {
    slug: 'leggings-mesh',
    name: 'Леггинсы 7/8 с сетчатыми вставками Mesh',
    categorySlug: 'leggings',
    description:
      'Леггинсы 7/8 с прозрачными сетчатыми вставками по бокам. Длина 7/8 ' +
      'открывает щиколотку и визуально удлиняет ногу. Вставки из спортивкой ' +
      'сетки добавляют вентиляцию в зонах перегрева.',
    shortDescription: 'Леггинсы 7/8 с сетчатыми боковыми вставками',
    sku: 'LG-MESH-01',
    price: 4200,
    compareAtPrice: 5200,
    tags: ['леггинсы', 'спорт', 'распродажа'],
    material: '70% полиамид, 30% эластан',
    activity: ['fitness', 'dance', 'running'],
    features: ['Длина 7/8', 'Сетчатые вставки', 'Вентиляция', 'Высокая посадка'],
    colorName: 'чёрный',
    colorHex: '#000000',
    photo: { folder: 'leggings-mesh', colorFile: 'black' },
    isFirstColor: true,
  },
  {
    slug: 'leggings-thermal',
    name: 'Утеплённые леггинсы ThermalFlex',
    categorySlug: 'leggings',
    description:
      'Тёплые леггинсы с начёсом внутри для тренировок на холоде. ' +
      'Двухслойная ткань отводит влагу и удерживает тепло, эластичный крой ' +
      'не сковывает движений. Подходят для бега и активного отдыха при ' +
      'температурах до −10°C.',
    shortDescription: 'Утеплённые леггинсы с начёсом для холода',
    sku: 'LG-THERMAL-01',
    price: 5200,
    tags: ['леггинсы', 'зима', 'бег'],
    material: '85% полиэстер, 15% эластан',
    activity: ['running', 'outdoor', 'winter'],
    features: ['Внутренний начёс', 'Теплоудержание', 'Влагоотвод', 'Высокая посадка'],
    colorName: 'синий',
    colorHex: '#4169E1',
    photo: { folder: 'leggings-thermal', colorFile: 'blue' },
    isFirstColor: true,
  },
  {
    slug: 'set-unity',
    name: 'Комплект с бра и леггинсами Unity',
    categorySlug: 'sets',
    description:
      'Спортивный комплект из бра и леггинсов с высокой посадкой в ' +
      'бирюзовом исполнении. Компрессионная ткань поддерживает мышцы, ' +
      'бра с съёмными чашечками даёт уверенную фиксацию. Идеальное ' +
      'сочетание для тренировок средней и высокой интенсивности.',
    shortDescription: 'Бирюзовый комплект бра + леггинсы',
    sku: 'SET-UNITY-01',
    price: 6800,
    compareAtPrice: 8200,
    tags: ['комплект', 'спорт', 'распродажа'],
    material: '75% нейлон, 25% эластан',
    activity: ['fitness', 'gym', 'yoga'],
    features: ['Бра с чашечками', 'Леггинсы с высокой посадкой', 'Компрессионная ткань'],
    colorName: 'бирюзовый',
    colorHex: '#40E0D0',
    photo: { folder: 'set-unity', colorFile: 'turquoise' },
    isFirstColor: true,
  },
  {
    slug: 'set-summerset',
    name: 'Комплект с кроп-топом и шортами SummerSet',
    categorySlug: 'sets',
    description:
      'Летний комплект из кроп-топа и коротких шорт в белом цвете. ' +
      'Лёгкая дышащая ткань и укороченный крой идеальны для тренировок ' +
      'в жару, танцев и пляжного отдыха. Эластичный пояс не сдавливает, ' +
      'силуэт выглядит чистым и спортивным.',
    shortDescription: 'Белый комплект кроп-топ + шорты',
    sku: 'SET-SUMMER-01',
    price: 5900,
    tags: ['комплект', 'лето', 'новинка'],
    material: '92% полиэстер, 8% эластан',
    activity: ['fitness', 'dance', 'beach'],
    features: ['Кроп-топ', 'Короткие шорты', 'Дышащая ткань'],
    colorName: 'белый',
    colorHex: '#FFFFFF',
    photo: { folder: 'set-summerset', colorFile: 'white' },
    isFirstColor: true,
  },
  {
    slug: 'set-layered',
    name: 'Трёхслойный комплект Layered Pro',
    categorySlug: 'sets',
    description:
      'Чёрный комплект из трёх предметов — бра, леггинсы и лёгкая ' +
      'накидка с капюшоном. Многослойность позволяет адаптировать образ ' +
      'к температуре: накидка снимается до и после тренировки. ' +
      'Технологичная ткань и продуманный крой для холодного зала и улицы.',
    shortDescription: 'Чёрный комплект: бра + леггинсы + накидка',
    sku: 'SET-LAYERED-01',
    price: 7500,
    compareAtPrice: 9200,
    tags: ['комплект', 'спорт', 'премиум'],
    material: '78% нейлон, 22% эластан',
    activity: ['fitness', 'gym', 'outdoor'],
    features: ['3 предмета', 'Накидка с капюшоном', 'Бра с поддержкой', 'Леггинсы с высокой посадкой'],
    colorName: 'чёрный',
    colorHex: '#000000',
    photo: { folder: 'set-layered', colorFile: 'black' },
    isFirstColor: true,
  },
];

const CATEGORIES = [
  {
    name: 'Спортивные топы',
    slug: 'tops',
    description: 'Спортивные топы, майки и бра для тренировок и повседневной носки',
    order: 1,
  },
  {
    name: 'Леггинсы',
    slug: 'leggings',
    description: 'Спортивные леггинсы с высокой посадкой для любых тренировок',
    order: 2,
  },
  {
    name: 'Костюмы',
    slug: 'sets',
    description: 'Готовые комплекты: бра + леггинсы, топ + шорты и многослойные наборы',
    order: 3,
  },
];

/** Собрать массив из 3-х картинок (isMain=true на первой) из известной папки S3. */
function buildImages(
  spec: ProductSpec,
): { id: string; url: string; alt: string; order: number; isMain?: boolean }[] {
  const { folder, colorFile } = spec.photo;
  const images: {
    id: string;
    url: string;
    alt: string;
    order: number;
    isMain?: boolean;
  }[] = [];
  for (let n = 1; n <= 3; n++) {
    const key = `products/${folder}/${colorFile}-${n}.webp`;
    images.push({
      id: `${folder}-${colorFile}-${n}`,
      url: s3Url(key),
      alt: `${spec.name} — фото ${n}`,
      order: n - 1,
      isMain: n === 1,
    });
  }
  return images;
}

async function run() {
  console.log('🔌 Подключение к БД...');
  console.log(`   host=${process.env.DB_HOST} db=${process.env.DB_DATABASE}`);
  await dataSource.initialize();
  console.log('✅ Подключено\n');

  const categoryRepo = dataSource.getRepository(Category);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariantEntity);

  // ─── 1. TRUNCATE: снести всё связанное с каталогом ───────────────────
  console.log('🧹 TRUNCATE каталога (включая заказы и корзины)...');
  const truncateTables = [
    'cart_items',
    'carts',
    'order_items',
    'orders',
    'reviews',
    'product_variants',
    'products',
    'categories',
  ];
  for (const table of truncateTables) {
    try {
      await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
      console.log(`   ✓ ${table}`);
    } catch (e) {
      console.warn(`   ! ${table}: ${(e as Error).message}`);
    }
  }
  console.log('');

  // ─── 2. Категории ────────────────────────────────────────────────────
  console.log('📁 Создание категорий...');
  const categoryMap = new Map<string, Category>();
  for (const c of CATEGORIES) {
    const saved = await categoryRepo.save(
      categoryRepo.create({
        name: c.name,
        slug: c.slug,
        description: c.description,
        order: c.order,
        isActive: true,
        seo: {
          title: c.name,
          description: c.description,
          keywords: [c.slug, 'спорт', 'одежда'],
        },
      }),
    );
    categoryMap.set(c.slug, saved);
    console.log(`   ✓ ${saved.slug} → ${saved.id}`);
  }
  console.log('');

  // ─── 3. Товары + варианты ────────────────────────────────────────────
  console.log('👕 Создание товаров...');
  let totalVariants = 0;
  for (const spec of PRODUCTS) {
    const category = categoryMap.get(spec.categorySlug);
    if (!category) {
      throw new Error(`Category not found: ${spec.categorySlug}`);
    }

    // modelId только для leggings-shaping (2 цвета)
    const modelId = spec.slug.startsWith('leggings-shaping')
      ? SHAPING_MODEL_ID
      : null;

    const product = productRepo.create({
      name: spec.name,
      slug: spec.slug,
      description: spec.description,
      shortDescription: spec.shortDescription,
      sku: spec.sku,
      price: spec.price,
      compareAtPrice: spec.compareAtPrice,
      categoryId: category.id,
      tags: spec.tags,
      images: buildImages(spec),
      color: spec.colorName,
      colorHex: spec.colorHex,
      modelId,
      attributes: {
        material: spec.material,
        activity: spec.activity,
        features: spec.features,
      },
      rating: 0,
      reviewsCount: 0,
      soldCount: 0,
      status: ProductStatus.ACTIVE,
      isVisible: true,
      seo: {
        title: spec.name,
        description: spec.shortDescription,
        keywords: spec.tags,
      },
    });

    const saved = await productRepo.save(product);

    const variants = SIZES.map((size) =>
      variantRepo.create({
        productId: saved.id,
        size,
        sku: `${saved.sku}-${size}`,
        stock: STOCK,
        price: spec.price,
      }),
    );
    await variantRepo.save(variants);
    totalVariants += variants.length;

    const mainImg = (saved.images as any[])[0]?.url;
    console.log(
      `   ✓ ${saved.slug.padEnd(24)} ${saved.price}₽` +
        `${spec.compareAtPrice ? ` (compare ${spec.compareAtPrice}₽)` : ''}` +
        `  modelId=${modelId ? 'shared' : 'null'}`,
    );
    console.log(`       main: ${mainImg}`);
  }

  // ─── 4. Итоги ────────────────────────────────────────────────────────
  const productCount = await productRepo.count();
  const variantCount = await variantRepo.count();
  const categoryCount = await categoryRepo.count();
  const ordersCount = await dataSource.query(
    `SELECT COUNT(*)::int AS c FROM orders`,
  );
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Готово:`);
  console.log(`   categories:    ${categoryCount}`);
  console.log(`   products:      ${productCount}`);
  console.log(`   variants:      ${variantCount}`);
  console.log(`   orders (должно быть 0): ${ordersCount[0]?.c}`);
  console.log(`   modelId (leggings-shaping): ${SHAPING_MODEL_ID}`);
  console.log('═══════════════════════════════════════');

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
