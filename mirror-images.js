// Зеркалирует картинки товаров из CDN Сималенда в наш S3 (SprintHost).
// Запуск: node mirror-images.js  (из /var/www/simple-shop-server, где node_modules и .env.production)
//
// images в БД — jsonb-массив объектов ProductImage {id, url, alt, order} (CSV-импорт).
// Легаси-запись 2026-10 хранила строки URL — поддерживаем оба формата на чтение,
// на запись всегда объекты.
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Client } = require('pg');

const env = {};
for (const line of fs.readFileSync('/var/www/simple-shop-server/.env.production', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const imgUrl = (img) => (typeof img === 'string' ? img : img && img.url) || '';

(async () => {
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const pg = new Client({ host: '127.0.0.1', port: 5432, user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE });
  await pg.connect();
  const { rows } = await pg.query("SELECT id, sku, images FROM products WHERE status='active'");
  let updated = 0, failed = 0;
  for (const p of rows) {
    const imgs = p.images || [];
    if (!imgs.length || !imgUrl(imgs[0]).includes('sima-land')) continue;
    const newImgs = [];
    let changed = false;
    for (let i = 0; i < imgs.length; i++) {
      const src = imgUrl(imgs[i]);
      const key = `products/${p.sku}/${i}.jpg`;
      const cdnUrl = env.S3_CDN_URL ? `${env.S3_CDN_URL}/${key}` : `${env.S3_PUBLIC_URL}/${env.S3_BUCKET}/${key}`;
      try {
        const res = await fetch(src, { method: 'GET', signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: buf, ContentType: 'image/jpeg', ACL: 'public-read' }));
        if (src !== cdnUrl) changed = true;
        newImgs.push(typeof imgs[i] === 'string'
          ? { id: `${p.sku}-img-${i}`, url: cdnUrl, alt: p.sku, order: i }
          : { ...imgs[i], url: cdnUrl, order: typeof imgs[i].order === 'number' ? imgs[i].order : i });
      } catch (e) {
        console.log(`  FAIL ${p.sku} #${i}: ${String(e).slice(0, 60)} — оставляю исходный URL`);
        newImgs.push(imgs[i]);
        failed++;
      }
    }
    if (changed) {
      await pg.query('UPDATE products SET images=$1 WHERE id=$2', [JSON.stringify(newImgs), p.id]);
      updated++;
      console.log(`  ok ${p.sku} (${imgs.length} фото)`);
    }
  }
  console.log(`Готово: обновлено ${updated} товаров, ошибок ${failed}`);
  await pg.end();
})();
