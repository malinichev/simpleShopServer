import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import puppeteer, { Browser, Page } from 'puppeteer';

dotenv.config({ path: '.env.development' });
dotenv.config({ path: '.env' });

// --- Config ---

const BRAND_URL = 'https://www.wildberries.ru/brands/311318479-svoyaesthetica';
const SCROLL_DELAY_MIN = 2000;
const SCROLL_DELAY_MAX = 4000;
const PAGE_DELAY_MIN = 2000;
const PAGE_DELAY_MAX = 4000;
const CARD_DELAY = 500;

// --- WB helpers ---

function getBasketNum(vol: number): string {
  const ranges: [number, number, number][] = [
    [0, 143, 1],
    [144, 287, 2],
    [288, 431, 3],
    [432, 719, 4],
    [720, 1007, 5],
    [1008, 1061, 6],
    [1062, 1115, 7],
    [1116, 1169, 8],
    [1170, 1313, 9],
    [1314, 1601, 10],
    [1602, 1655, 11],
    [1656, 1919, 12],
    [1920, 2045, 13],
    [2046, 2189, 14],
    [2190, 2405, 15],
    [2406, 2621, 16],
    [2622, 2837, 17],
    [2838, 3053, 18],
    [3054, 3269, 19],
    [3270, 3485, 20],
    [3486, 3701, 21],
    [3702, 3917, 22],
    [3918, 4133, 23],
    [4134, 4349, 24],
    [4350, 4565, 25],
    [4566, 4781, 26],
  ];
  for (const [min, max, basket] of ranges) {
    if (vol >= min && vol <= max) return String(basket).padStart(2, '0');
  }
  return '27';
}

function getBasketUrl(nm: number): string {
  const vol = Math.floor(nm / 100000);
  const part = Math.floor(nm / 1000);
  const basket = getBasketNum(vol);
  return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nm}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Category mapping ---

const CATEGORY_NAME_MAP: Record<string, string> = {
  'Леггинсы': 'Леггинсы',
  'Легинсы': 'Леггинсы',
  'Тайтсы': 'Леггинсы',
  'Топ': 'Топы',
  'Топы': 'Топы',
  'Бра': 'Бра',
  'Бюстгальтер спортивный': 'Бра',
  'Шорты': 'Шорты',
  'Костюмы спортивные': 'Костюмы',
  'Комплекты': 'Костюмы',
  'Худи': 'Худи',
  'Свитшоты': 'Свитшоты',
  'Куртки': 'Куртки',
  'Ветровки': 'Куртки',
  'Футболки': 'Футболки',
  'Боди': 'Боди',
  'Комбинезоны': 'Комбинезоны',
  'Брюки': 'Брюки',
  'Платья': 'Платья',
  'Рашгарды': 'Рашгарды',
  'Лонгсливы': 'Лонгсливы',
  'Жилеты': 'Жилеты',
};

const COLOR_HEX_MAP: Record<string, string> = {
  'черный': '#000000',
  'чёрный': '#000000',
  'белый': '#FFFFFF',
  'серый': '#808080',
  'розовый': '#FFC0CB',
  'красный': '#FF0000',
  'синий': '#0000FF',
  'голубой': '#87CEEB',
  'зеленый': '#008000',
  'зелёный': '#008000',
  'фиолетовый': '#800080',
  'бежевый': '#F5F5DC',
  'коричневый': '#8B4513',
  'оранжевый': '#FF8C00',
  'желтый': '#FFD700',
  'жёлтый': '#FFD700',
  'бордовый': '#800020',
  'молочный': '#FFFDD0',
  'пудровый': '#E8C4C4',
  'хаки': '#806B2A',
  'мятный': '#98FF98',
  'лавандовый': '#E6E6FA',
  'леопардовый': '#C6923E',
  'темно-синий': '#00008B',
  'темно-серый': '#404040',
  'светло-серый': '#D3D3D3',
  'графитовый': '#383838',
  'малиновый': '#DC143C',
  'персиковый': '#FFDAB9',
  'лиловый': '#CC99CC',
  'марсала': '#964B52',
  'темно-зеленый': '#006400',
  'оливковый': '#808000',
  'сливовый': '#660066',
  'шоколадный': '#7B3F00',
  'терракотовый': '#CC4E24',
  'кремовый': '#FFFDD0',
  'айвори': '#FFFFF0',
  'пепельный': '#B2BEB5',
};

// --- WB product interface ---

interface WbProduct {
  id: number;
  name: string;
  salePriceU: number;
  priceU: number;
  pics: number;
  sizes: { name: string; origName: string; stocks: { qty: number }[] }[];
  colors: { id: number; name: string }[];
  subjectId: number;
  subjectParentId: number;
  subject?: string;
}

// --- Puppeteer helpers ---

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

async function humanScroll(page: Page): Promise<void> {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let currentScroll = 0;

  while (currentScroll < scrollHeight - viewportHeight) {
    const scrollStep = randomDelay(300, 700);
    currentScroll += scrollStep;
    await page.evaluate((y) => window.scrollTo(0, y), currentScroll);
    await sleep(randomDelay(100, 300));
  }
}

async function randomMouseMove(page: Page): Promise<void> {
  const x = randomDelay(100, 1800);
  const y = randomDelay(100, 900);
  await page.mouse.move(x, y, { steps: randomDelay(5, 15) });
}

// --- Phase 1: Collect catalog via network interception ---

async function collectCatalog(page: Page): Promise<WbProduct[]> {
  console.log('[1/5] Collecting catalog from WB brand page...');

  const allProducts: WbProduct[] = [];
  const seenIds = new Set<number>();

  // Intercept catalog API responses
  page.on('response', async (response) => {
    const url = response.url();
    if (
      (url.includes('/catalog') || url.includes('/search')) &&
      url.includes('appType') &&
      response.status() === 200
    ) {
      try {
        const json = await response.json();
        const products = json?.data?.products;
        if (Array.isArray(products)) {
          for (const p of products) {
            if (p.id && !seenIds.has(p.id)) {
              seenIds.add(p.id);
              allProducts.push(p);
            }
          }
          console.log(`  Intercepted ${products.length} products (total unique: ${allProducts.length})`);
        }
      } catch {
        // Not JSON or parsing failed — skip
      }
    }
  });

  // Navigate to brand page
  console.log(`  Navigating to ${BRAND_URL}`);
  await page.goto(BRAND_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(randomDelay(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));

  // Scroll down to trigger lazy loading of all products
  let prevCount = 0;
  let noNewProductsCount = 0;
  const MAX_NO_NEW = 3;

  while (noNewProductsCount < MAX_NO_NEW) {
    await randomMouseMove(page);
    await humanScroll(page);
    await sleep(randomDelay(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));

    if (allProducts.length === prevCount) {
      noNewProductsCount++;
      console.log(`  No new products after scroll (${noNewProductsCount}/${MAX_NO_NEW})`);
    } else {
      noNewProductsCount = 0;
      prevCount = allProducts.length;
    }

    // Try clicking "Show more" button if exists
    try {
      const showMoreBtn = await page.$('.pagination-next, .btn__more, [class*="showMore"]');
      if (showMoreBtn) {
        await showMoreBtn.click();
        console.log('  Clicked "Show more" button');
        await sleep(randomDelay(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX));
      }
    } catch {
      // No button found
    }
  }

  console.log(`  Total unique products collected: ${allProducts.length}\n`);
  return allProducts;
}

// --- Phase 2: Fetch card details via network interception ---

async function fetchCardDetails(
  page: Page,
  nm: number,
): Promise<{
  description: string;
  vendorCode: string;
  material: string;
  features: string[];
}> {
  const result = {
    description: '',
    vendorCode: '',
    material: '',
    features: [] as string[],
  };

  let cardResolved = false;

  const cardPromise = new Promise<void>((resolve) => {
    const handler = async (response) => {
      const url = response.url();
      if (url.includes('card.json') && response.status() === 200) {
        try {
          const card = await response.json();
          result.description = card.description || '';
          result.vendorCode = card.vendor_code || card.nm_id?.toString() || '';

          if (card.compositions) {
            result.material = card.compositions
              .map((c: any) => `${c.value}% ${c.name}`)
              .join(', ');
          }
          if (card.options) {
            for (const opt of card.options) {
              if (opt.name && opt.value) {
                result.features.push(`${opt.name}: ${opt.value}`);
              }
            }
          }
        } catch {
          // parsing failed
        }
        cardResolved = true;
        page.off('response', handler);
        resolve();
      }
    };
    page.on('response', handler);

    // Timeout — don't wait forever
    setTimeout(() => {
      if (!cardResolved) {
        page.off('response', handler);
        resolve();
      }
    }, 10000);
  });

  // Navigate to product detail page
  await page.goto(`https://www.wildberries.ru/catalog/${nm}/detail.aspx`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await cardPromise;

  // If card.json wasn't intercepted, try DOM fallback
  if (!result.description) {
    try {
      result.description = await page.evaluate(() => {
        const descEl = document.querySelector(
          '[class*="description"] p, [class*="Description"] p, .collapsable__text',
        );
        return descEl?.textContent?.trim() || '';
      });
    } catch {
      // DOM parsing failed
    }
  }

  return result;
}

// --- Main ---

async function main(): Promise<void> {
  console.log('=== WB Import (Puppeteer): SVOYA ESTHETICA ===\n');

  // 1. Initialize DataSource
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

  // 2. Initialize S3
  const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
  const s3Bucket = process.env.S3_BUCKET || 'sports-shop';
  const s3CdnUrl = process.env.S3_CDN_URL || '';
  const s3PublicUrl =
    process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000';

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

  let browser: Browser | null = null;

  try {
    await dataSource.initialize();
    console.log('Connected to database\n');

    // 3. Clear products & categories
    console.log('Clearing products & categories...');
    for (const table of ['product_variants', 'products', 'categories']) {
      try {
        await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch {
        // Table might not exist yet
      }
    }
    console.log('  Done\n');

    // 4. Launch Puppeteer
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Stealth: remove webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // --- Phase 1: Collect catalog ---
    const allProducts = await collectCatalog(page);

    if (allProducts.length === 0) {
      console.log('No products found! Check if WB requires captcha.');
      console.log('The browser is still open — solve captcha manually, then restart the script.');
      // Keep browser open for manual intervention
      await sleep(60000);
      return;
    }

    // --- Phase 2: Create categories ---
    console.log('[2/5] Creating categories...');
    const subjectGroups = new Map<number, { name: string; products: WbProduct[] }>();
    for (const p of allProducts) {
      const subjectId = p.subjectId;
      if (!subjectGroups.has(subjectId)) {
        const rawName = (p as any).subject || `Category-${subjectId}`;
        const mappedName = CATEGORY_NAME_MAP[rawName] || rawName;
        subjectGroups.set(subjectId, { name: mappedName, products: [] });
      }
      subjectGroups.get(subjectId)!.products.push(p);
    }

    const categoryRepo = dataSource.getRepository('Category');
    const categoryMap = new Map<number, string>();
    let catOrder = 0;

    for (const [subjectId, group] of Array.from(subjectGroups.entries())) {
      const catSlug = slugify(group.name, { lower: true, strict: true }) || `cat-${subjectId}`;
      const existing = await categoryRepo.findOne({ where: { slug: catSlug } });
      if (existing) {
        categoryMap.set(subjectId, (existing as any).id);
        continue;
      }

      const cat = categoryRepo.create({
        name: group.name,
        slug: catSlug,
        description: `${group.name} от SVOYA ESTHETICA`,
        order: catOrder++,
        isActive: true,
        seo: {
          title: `${group.name} | SVOYA ESTHETICA`,
          description: `Купить ${group.name.toLowerCase()} от SVOYA ESTHETICA`,
          keywords: [group.name.toLowerCase(), 'спортивная одежда', 'svoya esthetica'],
        },
      });
      const saved = await categoryRepo.save(cat);
      categoryMap.set(subjectId, (saved as any).id);
      console.log(`  Created: ${group.name} (${group.products.length} products)`);
    }
    console.log('');

    // --- Phase 3: Import products with card details + images ---
    console.log('[3/5] Importing products (details + images)...');
    const productRepo = dataSource.getRepository('Product');
    const variantRepo = dataSource.getRepository('ProductVariantEntity');
    let imported = 0;

    for (const wp of allProducts) {
      try {
        const nm = wp.id;
        const baseUrl = getBasketUrl(nm);

        // Fetch card details via Puppeteer page navigation
        console.log(`  [${imported + 1}/${allProducts.length}] Fetching details for ${wp.name}...`);
        const card = await fetchCardDetails(page, nm);
        await sleep(randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX));

        const description = card.description || wp.name;
        const shortDescription = description.slice(0, 200).replace(/\s+\S*$/, '') || wp.name;
        const vendorCode = card.vendorCode;

        // Download & upload images (via fetch — images are static CDN, no blocking)
        const images: { id: string; url: string; alt: string; order: number }[] = [];
        const picCount = Math.min(wp.pics || 1, 10);

        for (let i = 1; i <= picCount; i++) {
          try {
            let buf: Buffer | null = null;
            for (const ext of ['webp', 'jpg']) {
              try {
                const imgRes = await fetch(`${baseUrl}/images/big/${i}.${ext}`, {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    Referer: 'https://www.wildberries.ru/',
                  },
                });
                if (imgRes.ok) {
                  buf = Buffer.from(await imgRes.arrayBuffer());
                  break;
                }
              } catch {
                // try next extension
              }
            }
            if (!buf) break;

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
              s3.send(
                new PutObjectCommand({
                  Bucket: s3Bucket,
                  Key: key,
                  Body: webp,
                  ContentType: 'image/webp',
                }),
              ),
              s3.send(
                new PutObjectCommand({
                  Bucket: s3Bucket,
                  Key: thumbKey,
                  Body: thumb,
                  ContentType: 'image/webp',
                }),
              ),
            ]);

            images.push({
              id: imageId,
              url: getFileUrl(key),
              alt: `${wp.name} - фото ${i}`,
              order: i - 1,
            });
          } catch (err) {
            console.log(`    Image ${i} failed for ${nm}: ${(err as Error).message}`);
            break;
          }
        }

        // Create product
        const sku = vendorCode || `WB-${nm}`;
        const salePrice = (wp.salePriceU || wp.priceU) / 100;
        const origPrice = wp.priceU / 100;
        const productSlug =
          slugify(wp.name, { lower: true, strict: true }) +
          '-' +
          uuidv4().slice(0, 6);

        const product = productRepo.create({
          name: wp.name,
          slug: productSlug,
          description: description || wp.name,
          shortDescription,
          sku,
          price: salePrice,
          compareAtPrice: origPrice > salePrice ? origPrice : undefined,
          categoryId: categoryMap.get(wp.subjectId),
          tags: ['svoya esthetica'],
          images,
          attributes: {
            material: card.material || '',
            activity: [],
            features: card.features,
          },
          seo: {
            title: wp.name,
            description: shortDescription,
            keywords: [wp.name.toLowerCase(), 'svoya esthetica'],
          },
          rating: 0,
          reviewsCount: 0,
          soldCount: 0,
          status: 'active',
          isVisible: true,
        });

        const savedProduct = await productRepo.save(product);
        const productId = (savedProduct as any).id;

        // Create variants from sizes × colors
        const sizes = wp.sizes?.filter((s) => s.name) || [];
        const colors = wp.colors?.length
          ? wp.colors
          : [{ id: 0, name: 'default' }];

        for (const color of colors) {
          const colorName = color.name?.toLowerCase() || 'default';
          const colorHex =
            COLOR_HEX_MAP[colorName] ||
            Object.entries(COLOR_HEX_MAP).find(([k]) =>
              colorName.includes(k),
            )?.[1] ||
            '#000000';

          if (sizes.length === 0) {
            const variant = variantRepo.create({
              productId,
              size: 'ONE SIZE',
              color: color.name || 'Default',
              colorHex,
              sku: `${sku}-${colorName.slice(0, 3).toUpperCase()}-OS`,
              stock: 10,
              price: salePrice,
            });
            await variantRepo.save(variant);
          } else {
            for (const size of sizes) {
              const totalStock =
                size.stocks?.reduce((sum, s) => sum + (s.qty || 0), 0) ?? 10;

              const variant = variantRepo.create({
                productId,
                size: size.origName || size.name,
                color: color.name || 'Default',
                colorHex,
                sku: `${sku}-${colorName.slice(0, 3).toUpperCase()}-${size.name}`,
                stock: totalStock > 0 ? totalStock : 10,
                price: salePrice,
              });
              await variantRepo.save(variant);
            }
          }
        }

        imported++;
        console.log(
          `  [${imported}/${allProducts.length}] ${wp.name} — ${images.length} imgs, ${sizes.length * colors.length || colors.length} variants`,
        );
        await sleep(CARD_DELAY);
      } catch (err) {
        console.error(`  Failed: ${wp.name} (${wp.id}):`, (err as Error).message);
      }
    }

    console.log(`\n[4/5] Done! Imported ${imported}/${allProducts.length} products.`);

    // Summary
    const productCount = await productRepo.count();
    const variantCount = await variantRepo.count();
    const categoryCount = await categoryRepo.count();
    console.log(`\n[5/5] === Summary ===`);
    console.log(`Categories: ${categoryCount}`);
    console.log(`Products:   ${productCount}`);
    console.log(`Variants:   ${variantCount}`);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    await dataSource.destroy();
  }
}

void main();
