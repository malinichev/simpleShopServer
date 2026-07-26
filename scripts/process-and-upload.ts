/**
 * Обрезает фото до 3:4 (портрет) и загружает в оба S3 — локальный MinIO и продакшен SprintHost.
 * Запуск: npx tsx scripts/process-and-upload.ts
 */
// @ts-ignore
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import * as crypto from 'crypto';

const INPUT_DIR = '/tmp/product-photos';
const OUTPUT_DIR = '/tmp/product-photos-processed';

// Целевое соотношение 3:4, результирующий размер
const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 1600;
const QUALITY = 85;

// Маппинг имён файлов к путям S3
const FILE_MAPPING: Record<string, { slug: string; color: string; n: number }> = {
  'top-form-black-1.png':     { slug: 'top-form', color: 'black', n: 1 },
  'top-form-black-2.png':     { slug: 'top-form', color: 'black', n: 2 },
  'top-form-black-3.png':     { slug: 'top-form', color: 'black', n: 3 },
  'top-flow-white-1.png':     { slug: 'top-flow', color: 'white', n: 1 },
  'top-flow-white-2.png':     { slug: 'top-flow', color: 'white', n: 2 },
  'top-flow-white-3.png':     { slug: 'top-flow', color: 'white', n: 3 },
  'top-sculpt-pink-1.png':    { slug: 'top-sculpt', color: 'pink', n: 1 },
  'top-sculpt-pink-2.png':    { slug: 'top-sculpt', color: 'pink', n: 2 },
  'top-sculpt-pink-3.png':    { slug: 'top-sculpt', color: 'pink', n: 3 },
  'leggings-shaping-black-1.png': { slug: 'leggings-shaping', color: 'black', n: 1 },
  'leggings-shaping-black-2.png': { slug: 'leggings-shaping', color: 'black', n: 2 },
  'leggings-shaping-black-3.png': { slug: 'leggings-shaping', color: 'black', n: 3 },
  'leggings-shaping-grey-1.png':  { slug: 'leggings-shaping', color: 'grey', n: 1 },
  'leggings-shaping-grey-2.png':  { slug: 'leggings-shaping', color: 'grey', n: 2 },
  'leggings-shaping-grey-3.png':  { slug: 'leggings-shaping', color: 'grey', n: 3 },
  'leggings-mesh-black-1.png':    { slug: 'leggings-mesh', color: 'black', n: 1 },
  'leggings-mesh-black-2.png':    { slug: 'leggings-mesh', color: 'black', n: 2 },
  'leggings-mesh-black-3.png':    { slug: 'leggings-mesh', color: 'black', n: 3 },
  'leggings-thermal-blue-1.png':  { slug: 'leggings-thermal', color: 'blue', n: 1 },
  'leggings-thermal-blue-2.png':  { slug: 'leggings-thermal', color: 'blue', n: 2 },
  'leggings-thermal-blue-3.png':  { slug: 'leggings-thermal', color: 'blue', n: 3 },
  'set-unity-turquoise-1.png':    { slug: 'set-unity', color: 'turquoise', n: 1 },
  'set-unity-turquoise-2.png':    { slug: 'set-unity', color: 'turquoise', n: 2 },
  'set-unity-turquoise-3.png':    { slug: 'set-unity', color: 'turquoise', n: 3 },
  'set-summerset-white-1.png':    { slug: 'set-summerset', color: 'white', n: 1 },
  'set-summerset-white-2.png':    { slug: 'set-summerset', color: 'white', n: 2 },
  'set-summerset-white-3.png':    { slug: 'set-summerset', color: 'white', n: 3 },
  'set-layered-black-1.png':      { slug: 'set-layered', color: 'black', n: 1 },
  'set-layered-black-2.png':      { slug: 'set-layered', color: 'black', n: 2 },
  'set-layered-black-3.png':      { slug: 'set-layered', color: 'black', n: 3 },
};

// Конфиги S3
const LOCAL_S3 = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'sports-shop',
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
  publicUrl: 'http://localhost:9000/sports-shop',
};

const PROD_S3 = {
  endpoint: 'https://s3.spb.sprinthost.ru',
  region: 'spb',
  bucket: 's3-952264',
  accessKey: 'TE5Y2D110Y5GBF53WZZZ',
  secretKey: 'uhlpAIQzVczvjmjBLTrdRHPiugMOYO7cjOa3G754',
  publicUrl: 'https://s3-952264.s3.spb.sprinthost.ru',
};

function createS3Client(config: typeof LOCAL_S3) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });
}

async function cropToPortrait(inputPath: string, outputPath: string): Promise<void> {
  // Простой подход: fit cover с целевым размером 1200×1600 (3:4)
  // sharp сам обрежет лишнее по центру
  await sharp(inputPath)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'center' })
    .webp({ quality: QUALITY })
    .toFile(outputPath);
}

async function uploadToS3(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return key;
}

async function main() {
  const fs = await import('fs');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = readdirSync(INPUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`Найдено ${files.length} файлов для обработки\n`);

  const localClient = createS3Client(LOCAL_S3);
  const prodClient = createS3Client(PROD_S3);

  const results: Record<string, { localUrl: string; prodUrl: string }> = {};

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mapping = FILE_MAPPING[file];
    if (!mapping) {
      console.log(`⏭️  Пропущен (нет маппинга): ${file}`);
      continue;
    }

    const inputPath = join(INPUT_DIR, file);
    const outputFile = file.replace('.png', '.webp');
    const outputPath = join(OUTPUT_DIR, outputFile);
    const s3Key = `products/${mapping.slug}/${mapping.color}-${mapping.n}.webp`;

    // Кроп
    console.log(`[${i + 1}/${files.length}] ✂️  ${file} → ${outputFile}`);
    await cropToPortrait(inputPath, outputPath);

    const buffer = readFileSync(outputPath);

    // Загрузка в локальный MinIO
    await uploadToS3(localClient, LOCAL_S3.bucket, s3Key, buffer, 'image/webp');
    const localUrl = `${LOCAL_S3.publicUrl}/${s3Key}`;
    console.log(`   📦 Local: ${localUrl}`);

    // Загрузка в продакшен SprintHost
    await uploadToS3(prodClient, PROD_S3.bucket, s3Key, buffer, 'image/webp');
    const prodUrl = `${PROD_S3.publicUrl}/${s3Key}`;
    console.log(`   🚀 Prod:  ${prodUrl}`);

    results[file] = { localUrl, prodUrl };
  }

  // Сохраняем результаты
  fs.writeFileSync(
    join(OUTPUT_DIR, 'urls.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(`\n✅ Готово! ${Object.keys(results).length} фото обработано.`);
  console.log(`URLs сохранены в ${OUTPUT_DIR}/urls.json`);
}

main().catch(console.error);
