import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// Support --prod flag to load .env.production
const isProd = process.argv.includes('--prod');
if (isProd) {
  dotenv.config({ path: '.env.production' });
  console.log('*** PRODUCTION MODE ***\n');
} else {
  dotenv.config({ path: '.env.development' });
  dotenv.config({ path: '.env' });
}

// --- WB Image URL helpers ---

function getBasketNum(vol: number): string {
  const ranges: [number, number, number][] = [
    [0, 143, 1], [144, 287, 2], [288, 431, 3], [432, 719, 4],
    [720, 1007, 5], [1008, 1061, 6], [1062, 1115, 7], [1116, 1169, 8],
    [1170, 1313, 9], [1314, 1601, 10], [1602, 1655, 11], [1656, 1919, 12],
    [1920, 2045, 13], [2046, 2189, 14], [2190, 2405, 15], [2406, 2621, 16],
    [2622, 2837, 17], [2838, 3053, 18], [3054, 3269, 19], [3270, 3485, 20],
    [3486, 3701, 21], [3702, 3917, 22], [3918, 4133, 23], [4134, 4349, 24],
    [4350, 4565, 25], [4566, 4781, 26], [4782, 4997, 27], [4998, 5213, 28],
    [5214, 5429, 29], [5430, 5645, 30], [5646, 5861, 31], [5862, 6077, 32],
    [6078, 6293, 33], [6294, 6509, 34], [6510, 6725, 35], [6726, 6941, 36],
  ];
  for (const [min, max, basket] of ranges) {
    if (vol >= min && vol <= max) return String(basket).padStart(2, '0');
  }
  return '37';
}

function getWbImageUrl(nmId: number, photoIndex: number, size = 'big'): string {
  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  const basket = getBasketNum(vol);
  return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/${size}/${photoIndex}.webp`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Category guessing from product name ---

function guessCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('костюм')) return 'Костюмы';
  if (lower.includes('леггинсы') || lower.includes('лосины') || lower.includes('тайтсы')) return 'Леггинсы';
  if (lower.includes('купальник')) return 'Купальники';
  if (lower.includes('комбинезон')) return 'Комбинезоны';
  if (lower.includes('топ') || lower.includes('бра')) return 'Топы';
  if (lower.includes('шорты')) return 'Шорты';
  if (lower.includes('футболка')) return 'Футболки';
  if (lower.includes('худи')) return 'Худи';
  return 'Спортивная одежда';
}

// --- Generate description from product name ---

function generateDescription(name: string): string {
  const lower = name.toLowerCase();

  let type = 'изделие';
  if (lower.includes('комбинезон')) type = 'комбинезон';
  else if (lower.includes('костюм')) type = 'костюм';
  else if (lower.includes('леггинсы') || lower.includes('лосины')) type = 'леггинсы';
  else if (lower.includes('купальник')) type = 'купальник';
  else if (lower.includes('топ')) type = 'топ';

  const features: string[] = [];
  if (lower.includes('длинн')) features.push('длинного кроя');
  if (lower.includes('коротк')) features.push('укороченного кроя');
  if (lower.includes('шорт')) features.push('с шортами');
  if (lower.includes('юбк')) features.push('с юбкой-шортами');
  if (lower.includes('клеш')) features.push('с расклешённым низом');
  if (lower.includes('обтяг')) features.push('облегающего силуэта');
  if (lower.includes('флис') || lower.includes('тепл')) features.push('с мягкой флисовой подкладкой для тепла');
  if (lower.includes('рубчик')) features.push('из фактурного трикотажа в рубчик');
  if (lower.includes('пушап') || lower.includes('сборк')) features.push('с эффектом пуш-ап');
  if (lower.includes('утяг')) features.push('с утягивающим эффектом');

  const featuresStr = features.length > 0 ? ' ' + features.join(', ') : '';

  return `Стильный ${type}${featuresStr} от SVOYA ESTHETICA. Идеально подходит для фитнеса, йоги, танцев и активного образа жизни. Выполнен из высококачественной ткани с отличной посадкой, обеспечивает свободу движений и комфорт во время тренировок. Luxury-sport эстетика для уверенных в себе женщин.`;
}

// --- Color palette (same as products.seed.ts) ---

interface ColorOption {
  name: string;
  hex: string;
  code: string; // for SKU
}

const COLORS: ColorOption[] = [
  { name: 'Черный', hex: '#000000', code: 'BLK' },
  { name: 'Белый', hex: '#FFFFFF', code: 'WHT' },
  { name: 'Серый', hex: '#808080', code: 'GRY' },
  { name: 'Бежевый', hex: '#D4A574', code: 'BGE' },
  { name: 'Розовый', hex: '#FFB6C1', code: 'PNK' },
  { name: 'Бордовый', hex: '#800020', code: 'BRD' },
  { name: 'Синий', hex: '#000080', code: 'BLU' },
  { name: 'Оливковый', hex: '#808000', code: 'OLV' },
  { name: 'Мокко', hex: '#4B3621', code: 'MCH' },
  { name: 'Лавандовый', hex: '#B57EDC', code: 'LVN' },
];

function pickColors(count: number): ColorOption[] {
  const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
  // Always include black as first
  const blackIdx = shuffled.findIndex((c) => c.code === 'BLK');
  if (blackIdx > 0) {
    [shuffled[0], shuffled[blackIdx]] = [shuffled[blackIdx], shuffled[0]];
  }
  return shuffled.slice(0, count);
}

// --- Default sizes for sportswear ---

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SWIMSUIT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

// How many color variants per product (2-4)
const MIN_COLORS = 2;
const MAX_COLORS = 4;

// --- Parse HTML ---

interface ParsedProduct {
  nmId: number;
  name: string;
  salePrice: number;
  oldPrice: number;
  rating: number;
  reviewsCount: number;
  imageUrl: string;
}

function parseHtml(html: string): ParsedProduct[] {
  const $ = cheerio.load(html);
  const products: ParsedProduct[] = [];

  $('article.product-card').each((_, el) => {
    const $el = $(el);
    const nmId = parseInt($el.attr('data-nm-id') || '0', 10);
    if (!nmId) return;

    // Name: brand name + product name
    const brandName = $el.find('.product-card__brand').text().trim();
    const productName = $el.find('.product-card__name').contents().filter(function () {
      return this.type === 'text' || (this as any).tagName !== 'span' || !$(this).hasClass('product-card__name-separator');
    }).text().replace(/\s*\/\s*/, '').trim();

    const name = productName || `${brandName} Спортивная одежда`;

    // Price — remove &nbsp; and non-digit chars
    const salePriceText = $el.find('.price__lower-price').text().replace(/[^\d]/g, '');
    const oldPriceText = $el.find('del').text().replace(/[^\d]/g, '');
    const salePrice = parseInt(salePriceText, 10) || 0;
    const oldPrice = parseInt(oldPriceText, 10) || 0;

    // Rating
    const ratingText = $el.find('.address-rate-mini').text().replace(',', '.');
    const rating = parseFloat(ratingText) || 0;

    // Reviews count
    const reviewsText = $el.find('.product-card__count').text().replace(/[^\d]/g, '');
    const reviewsCount = parseInt(reviewsText, 10) || 0;

    // Image URL
    const imageUrl = $el.find('.j-thumbnail').attr('src') || '';

    products.push({ nmId, name, salePrice, oldPrice, rating, reviewsCount, imageUrl });
  });

  return products;
}

// --- Main ---

async function main(): Promise<void> {
  console.log('=== WB HTML Import: SVOYA ESTHETICA ===\n');

  // Read HTML from file or stdin
  const htmlPath = path.resolve(__dirname, 'wb-catalog.html');
  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML file not found: ${htmlPath}`);
    console.error('Save the WB brand page HTML to server/src/database/seeds/wb-catalog.html');
    process.exit(1);
  }
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Parse
  const parsed = parseHtml(html);
  console.log(`Parsed ${parsed.length} products from HTML\n`);

  if (parsed.length === 0) {
    console.error('No products found in HTML!');
    process.exit(1);
  }

  // Print parsed products
  for (const p of parsed) {
    console.log(`  ${p.nmId}: ${p.name} — ${p.salePrice}₽ (было ${p.oldPrice}₽) ★${p.rating}`);
  }
  console.log('');

  // Initialize DataSource
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

  // Initialize S3
  const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  const s3Bucket = process.env.S3_BUCKET || 'sports-shop';
  const s3CdnUrl = process.env.S3_CDN_URL || '';
  const s3PublicUrl = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000';

  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
    forcePathStyle: true,
  });

  function getFileUrl(key: string): string {
    if (s3CdnUrl) return `${s3CdnUrl}/${key}`;
    return `${s3PublicUrl}/${s3Bucket}/${key}`;
  }

  try {
    await dataSource.initialize();
    console.log('Connected to database\n');

    // Clear existing products & categories
    console.log('Clearing products & categories...');
    for (const table of ['cart_items', 'carts', 'order_items', 'orders', 'reviews', 'product_variants', 'products', 'categories']) {
      try {
        await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch {
        // Table might not exist
      }
    }
    console.log('  Done\n');

    // Create categories
    console.log('[1/3] Creating categories...');
    const categoryRepo = dataSource.getRepository('Category');
    const categoryMap = new Map<string, string>(); // name -> id
    let catOrder = 0;

    const categoryNames = [...new Set(parsed.map((p) => guessCategory(p.name)))];
    for (const catName of categoryNames) {
      const catSlug = slugify(catName, { lower: true, strict: true }) || `cat-${catOrder}`;
      const cat = categoryRepo.create({
        name: catName,
        slug: catSlug,
        description: `${catName} от SVOYA ESTHETICA — luxury-sport эстетика`,
        order: catOrder++,
        isActive: true,
        seo: {
          title: `${catName} | SVOYA ESTHETICA`,
          description: `Купить ${catName.toLowerCase()} от SVOYA ESTHETICA`,
          keywords: [catName.toLowerCase(), 'спортивная одежда', 'svoya esthetica'],
        },
      });
      const saved = await categoryRepo.save(cat);
      categoryMap.set(catName, (saved as any).id);
      console.log(`  ${catName} (slug: ${catSlug})`);
    }
    console.log('');

    // Import products
    console.log('[2/3] Importing products...');
    const productRepo = dataSource.getRepository('Product');
    const variantRepo = dataSource.getRepository('ProductVariantEntity');
    let imported = 0;

    for (const wp of parsed) {
      try {
        console.log(`  [${imported + 1}/${parsed.length}] ${wp.name}...`);

        // Download images from WB CDN (try up to 15 photos)
        const images: { id: string; url: string; alt: string; order: number }[] = [];
        const MAX_PHOTOS = 15;

        for (let i = 1; i <= MAX_PHOTOS; i++) {
          try {
            const imgUrl = getWbImageUrl(wp.nmId, i, 'big');
            const imgRes = await fetch(imgUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://www.wildberries.ru/',
              },
            });

            if (!imgRes.ok) break;

            const buf = Buffer.from(await imgRes.arrayBuffer());
            if (buf.length < 1000) break; // Too small, likely error page

            const imageId = uuidv4();
            const key = `products/${imageId}.webp`;
            const thumbKey = `products/${imageId}_thumb.webp`;

            const webp = await sharp(buf)
              .resize(1920, undefined, { withoutEnlargement: true })
              .webp({ quality: 85 })
              .toBuffer();
            const thumb = await sharp(buf)
              .resize(300, 300, { fit: 'cover' })
              .webp({ quality: 85 })
              .toBuffer();

            await Promise.all([
              s3.send(new PutObjectCommand({
                Bucket: s3Bucket, Key: key, Body: webp, ContentType: 'image/webp',
              })),
              s3.send(new PutObjectCommand({
                Bucket: s3Bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp',
              })),
            ]);

            images.push({
              id: imageId,
              url: getFileUrl(key),
              alt: `${wp.name} — фото ${i}`,
              order: i - 1,
            });
          } catch {
            break;
          }
        }

        console.log(`    ${images.length} images uploaded`);

        // Generate base data
        const catName = guessCategory(wp.name);
        const categoryId = categoryMap.get(catName);
        const description = generateDescription(wp.name);
        const shortDescription = description.slice(0, 200).replace(/\s+\S*$/, '');
        const baseSku = `SE-${wp.nmId}`;
        const baseSlug = slugify(wp.name, { lower: true, strict: true });
        const isSwimsuits = wp.name.toLowerCase().includes('купальник');
        const sizes = isSwimsuits ? SWIMSUIT_SIZES : DEFAULT_SIZES;

        // Each color = separate product, linked by modelId
        const colorCount = MIN_COLORS + Math.floor(Math.random() * (MAX_COLORS - MIN_COLORS + 1));
        const colors = pickColors(colorCount);
        const modelId = uuidv4();

        for (let ci = 0; ci < colors.length; ci++) {
          const color = colors[ci];
          const isFirst = ci === 0;

          // First color uses original name/slug, others append color name
          const productName = isFirst ? wp.name : `${wp.name} (${color.name})`;
          const productSlug = isFirst
            ? `${baseSlug}-${uuidv4().slice(0, 6)}`
            : `${baseSlug}-${slugify(color.name, { lower: true, strict: true })}-${uuidv4().slice(0, 6)}`;
          const productSku = isFirst ? baseSku : `${baseSku}-${color.code}`;

          const product = productRepo.create({
            name: productName,
            slug: productSlug,
            description,
            shortDescription,
            sku: productSku,
            price: wp.salePrice,
            compareAtPrice: wp.oldPrice > wp.salePrice ? wp.oldPrice : undefined,
            categoryId,
            color: color.name,
            colorHex: color.hex,
            modelId,
            tags: ['svoya esthetica'],
            images,
            attributes: {
              material: 'Полиамид 80%, Эластан 20%',
              activity: ['Фитнес', 'Йога', 'Танцы'],
              features: [],
            },
            seo: {
              title: `${productName} | SVOYA ESTHETICA`,
              description: shortDescription,
              keywords: [wp.name.toLowerCase(), color.name.toLowerCase(), 'svoya esthetica', 'спортивная одежда'],
            },
            rating: wp.rating,
            reviewsCount: isFirst ? wp.reviewsCount : Math.floor(wp.reviewsCount * (0.3 + Math.random() * 0.5)),
            soldCount: Math.floor(Math.random() * 200) + 50,
            status: 'active',
            isVisible: true,
          });

          const savedProduct = await productRepo.save(product);
          const productId = (savedProduct as any).id;

          // Create variants — sizes only (color is on product level)
          for (const size of sizes) {
            const stock = Math.floor(Math.random() * 15) + 3;
            const variant = variantRepo.create({
              productId,
              size,
              sku: `${productSku}-${size}`,
              stock,
              price: wp.salePrice,
            });
            await variantRepo.save(variant);
          }
        }

        imported++;
        console.log(`    OK — ${colors.length} colors × ${sizes.length} sizes = ${colors.length * sizes.length} variants`);

        // Small delay between image downloads
        await sleep(200);
      } catch (err) {
        console.error(`  FAILED: ${wp.name}:`, (err as Error).message);
      }
    }

    // Summary
    const productCount = await productRepo.count();
    const variantCount = await variantRepo.count();
    const categoryCount = await categoryRepo.count();

    console.log(`\n[3/3] === Summary ===`);
    console.log(`Categories: ${categoryCount}`);
    console.log(`Products:   ${productCount}`);
    console.log(`Variants:   ${variantCount}`);
    console.log(`\nDone! Imported ${imported}/${parsed.length} products.`);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

void main();
