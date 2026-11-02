/**
 * Скачать картинку по URL (наш S3 или CDN поставщика).
 * Перед запросом URL валидируется (SSRF): только http/https,
 * в проде запрещены loopback/приватные хосты (см. assertFetchableUrl).
 */
export async function fetchImage(url: string): Promise<Buffer> {
  assertFetchableUrl(url);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'svoybrand-image-regen/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(
      `Не удалось скачать исходное фото (${response.status}): ${url}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Разрешён ли URL для серверной загрузки картинки: схема строго http/https;
 * loopback/приватные хосты — только вне прода (в dev нужны локальные фото
 * каталога :3002, S3 :9000 и e2e-мок :4011; в проде картинки живут на
 * публичных S3/CDN).
 */
export function assertFetchableUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Некорректный URL фото');
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new Error('Протокол URL фото должен быть http/https');
  }
  if (process.env.NODE_ENV === 'production') {
    const host = parsed.hostname.toLowerCase();
    if (isLoopbackOrPrivateHost(host)) {
      throw new Error('В проде запрещены loopback/приватные адреса в URL фото');
    }
  }
}

function isLoopbackOrPrivateHost(host: string): boolean {
  const bare = host.replace(/^\[/, '').replace(/\]$/, '');
  if (
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    bare.endsWith('.local') ||
    bare.endsWith('.internal')
  ) {
    return true;
  }
  const parts = bare.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    return (
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  // IPv6 loopback / ULA / link-local
  if (bare.includes(':')) {
    return bare === '::1' || bare.startsWith('fc') || bare.startsWith('fd') || bare.startsWith('fe80');
  }
  return false;
}

/** Тип картинки по магическим байтам (как UploadService.validateMagicBytes). */
export function sniffMimeType(buffer: Buffer): string {
  const isJpeg =
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;
  if (isJpeg) return 'image/jpeg';
  if (isPng) return 'image/png';
  if (isWebp) return 'image/webp';
  return 'image/png';
}
