/**
 * Утилиты синка остатков с Сималенда (без side-эффектов — тестируются юнитами).
 */

/** Верхняя граница стока варианта — как при сборке каталога (build_assortment.py). */
export const STOCK_CAP = 999;

/** Первый прогон не имеет якоря — вычитаем продажи за последние 24 часа. */
export const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * sid размера Сималенда из SKU варианта. Конвенция каталога: SKU = `SL-{sid}`
 * (продукт и вариант), см. docs/research/sima-sync-2026-11-03/README.md.
 * Не-сималендовские SKU (не матчатся) → null, синк их не трогает.
 */
export function parseSimaSid(sku: string): number | null {
  const match = sku
    .trim()
    .toUpperCase()
    .match(/^SL-(\d+)$/);
  return match ? Number(match[1]) : null;
}

export interface SimaItemAvailability {
  /** Остаток у поставщика. */
  balance: number;
  /** Минимальная партия позиции: если balance < min_qty — купить нельзя. */
  minQty: number;
  /** Товар снят с продажи у поставщика. */
  disabled: boolean;
}

/**
 * Целевой сток варианта: сколько единиц можно выставить на витрину.
 *  - пропал у поставщика / партия недостижима → 0;
 *  - иначе min(balance, 999) минус наши продажи с прошлого прогона
 *    (поставщик о них не знает, пока товар не выкуплен), не ниже 0.
 */
export function computeTargetStock(
  availability: SimaItemAvailability,
  soldSince: number,
): number {
  if (availability.disabled) return 0;
  if (availability.balance < Math.max(1, availability.minQty)) return 0;
  const supplierStock = Math.min(availability.balance, STOCK_CAP);
  return Math.max(0, supplierStock - Math.max(0, soldSince));
}

/**
 * Разрешён ли URL для серверного запроса к API поставщика: схема строго
 * http/https; loopback/приватные хосты — только вне прода (в dev/e2e нужен
 * локальный мок :4012; в проде API Сималенда — публичный https).
 */
export function assertFetchableApiUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Некорректный URL API поставщика');
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new Error('Протокол URL API должен быть http/https');
  }
  if (process.env.NODE_ENV === 'production') {
    if (isLoopbackOrPrivateHost(parsed.hostname.toLowerCase())) {
      throw new Error('В проде запрещены loopback/приватные адресы в URL API');
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
    return (
      bare === '::1' ||
      bare.startsWith('fc') ||
      bare.startsWith('fd') ||
      bare.startsWith('fe80')
    );
  }
  return false;
}
