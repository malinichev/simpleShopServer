/**
 * Правила маппинга выгрузки Сималенда на каталог магазина:
 * категории, цвета (нормализация + hex), наценка. Порт отбора
 * docs/research/sima-sync-2026-11-03/build_assortment.py.
 */

import type { SimaExportRow } from './sima-export.parser';

/** Порядок важен: «костюм» раньше «пижамы», конкретика раньше общих слов. */
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/костюм/i, 'Домашние костюмы'],
  [/пижам|сорочк|ночн/i, 'Пижамы'],
  [/халат/i, 'Халаты'],
  [/шорт|брюк|велосипедк|лосин|штан/i, 'Шорты и брюки'],
  [/топ|майк|футболк/i, 'Топы и майки'],
  [/комбинезон/i, 'Комбинезоны'],
];

/** Наша категория для строки выгрузки; null — не сопоставлено (ошибка строки). */
export function mapStoreCategory(row: SimaExportRow): string | null {
  const text = `${row.subCategory} ${row.title}`;
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return null;
}

/** Цвет по нормализованному имени; словарь даёт hex, имя — дословно. */
const COLOR_HEX: Array<[string, string]> = [
  ['чёрн', '#111827'], ['черн', '#111827'], ['бел', '#FFFFFF'],
  ['молочн', '#F5F0E6'], ['графит', '#374151'], ['сер', '#9CA3AF'],
  ['серо-бежев', '#B9AFA0'], ['пудров', '#F5C9D4'], ['розов', '#EC4899'],
  ['тёмно-син', '#1E3A8A'], ['темно-син', '#1E3A8A'], ['син', '#1E3A8A'],
  ['электрик', '#2563EB'], ['голуб', '#60A5FA'], ['бежев', '#D6BFA4'],
  ['кофе', '#6F4E37'], ['коричнев', '#6F4E37'], ['оливков', '#556B2F'],
  ['зелён', '#16A34A'], ['зелен', '#16A34A'], ['бордо', '#7F1D1D'],
  ['красн', '#DC2626'], ['жёлт', '#EAB308'], ['желт', '#EAB308'],
  ['оранжев', '#F97316'], ['фиолетов', '#7C3AED'], ['сиренев', '#C4B5FD'],
  ['лаванд', '#C4B5FD'], ['мятн', '#98FF98'], ['хаки', '#6B6B45'],
  ['терракот', '#C1663E'], ['бирюзов', '#06B6D4'], ['изумруд', '#059669'],
  ['васильк', '#4338CA'], ['полоса', '#9CA3AF'], ['леопард', '#B45309'],
  ['фукси', '#D946EF'], ['персик', '#FFDAB9'], ['айвори', '#FFFFF0'],
  ['мультиколор', '#9CA3AF'], ['принт', '#9CA3AF'], ['разноцветн', '#9CA3AF'],
];

/** hex по совпадению подстроки; конкретные оттенки раньше общих префиксов. */
export function colorHexFor(colorName: string): string {
  const low = colorName.toLowerCase();
  const sorted = [...COLOR_HEX].sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, hex] of sorted) {
    if (low.includes(pattern)) return hex;
  }
  return '';
}

export function round10(x: number): number {
  return Math.round(x / 10) * 10;
}

export function round50(x: number): number {
  return Math.round(x / 50) * 50;
}

/** Оптовая база строки («Крупный опт», fallback — розница). */
export function wholesaleBase(row: SimaExportRow): number {
  return row.wholesalePrice > 0 ? row.wholesalePrice : row.retailPrice;
}

/**
 * Наша цена = round10(опт × 2), compareAt = round50(цена × 1,75) —
 * калибровка запускного ассортимента (2026-11-03).
 */
export function pricePairFor(base: number): { price: number; compareAt: number } {
  const price = round10(base * 2);
  return { price, compareAt: round50(price * 1.75) };
}

/**
 * Цена конкретного размера: пропорционально нашей наценке строки; своя —
 * только при разбросе розничных цен размеров > 15% (как в отборе).
 */
export function variantPriceFor(
  modRetail: number,
  row: SimaExportRow,
): number | undefined {
  const { retailPrice } = row;
  const base = wholesaleBase(row);
  const retails = row.sizes
    .map((s) => s.price)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  if (
    modRetail <= 0 ||
    retailPrice <= 0 ||
    retails.length < 2 ||
    base <= 0
  ) {
    return undefined;
  }
  const min = Math.min(...retails);
  const max = Math.max(...retails);
  if ((max - min) / retailPrice <= 0.15) return undefined;
  const ratio = base / retailPrice;
  return round10(modRetail * ratio);
}
