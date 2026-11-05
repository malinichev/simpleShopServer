import { parse } from 'csv-parse/sync';

/**
 * Парсер пользовательской выгрузки Сималенда (кнопка на сайте → CSV,
 * cloudparser): `;`-разделитель, BOM, мультистрочные ячейки.
 * Одна строка файла = ОДНА ЦВЕТОВАЯ разновидность со своим размерным рядом
 * (в «Модификациях» — выровненные списки по размерам с sid каждого размера).
 */

export interface SimaSizeMod {
  size: string;
  sid?: number;
  price?: number;
  stock: number;
}

export interface SimaExportRow {
  /** Номер строки в исходном файле (для ошибок). */
  rowNum: number;
  /** Артикул строки = sid цветовой разновидности. */
  sid: number;
  title: string;
  retailPrice: number;
  /** «Крупный опт» — база для нашей цены (×2). */
  wholesalePrice: number;
  stock: number;
  description: string;
  images: string[];
  manufacturer: string;
  color: string;
  composition: string;
  fabric: string;
  barcode: string;
  /** Категория 2 = пол («Женская одежда»), Категория 4 = подкатегория. */
  genderCategory: string;
  subCategory: string;
  sizes: SimaSizeMod[];
}

export interface SimaParseResult {
  rows: SimaExportRow[];
  totalRows: number;
  skippedNoSid: number;
}

const BOM = '\uFEFF';

/** Список «a; b; c» → массив. */
function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** «В наличии,21» / «21» / «Да» → число; пусто/Нет → 0. */
function parseStock(value: string | undefined): number {
  if (!value) return 0;
  const m = value.match(/(\d[\d\s]*)/);
  if (!m) return /^да$/i.test(value.trim()) ? 0 : 0;
  const n = parseInt(m[1].replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? Math.min(n, 99_999) : 0;
}

/**
 * Многострочная ячейка «Модификации» — fallback, когда выровненных
 * колонок нет: каждый размер — своя строка вида
 * `Размер:"52"|Цена:"1440"|Артикул:"5354799"|Наличие:"В наличии,21"|…`.
 */
function parseModsBlob(blob: string | undefined): SimaSizeMod[] {
  if (!blob) return [];
  const out: SimaSizeMod[] = [];
  for (const line of blob.split(/\r?\n/)) {
    const size = line.match(/Размер:"([^"]+)"/)?.[1];
    const sid = line.match(/Артикул:"(\d+)"/)?.[1];
    const price = line.match(/Цена:"([\d.,]+)"/)?.[1];
    const stock = line.match(/Наличие:"([^"]*)"/)?.[1];
    if (!size && !sid) continue;
    out.push({
      size: size?.trim() || '',
      sid: sid ? parseInt(sid, 10) : undefined,
      price: price ? toNumber(price) : undefined,
      stock: parseStock(stock),
    });
  }
  return out;
}

function buildSizes(headers: string[], record: string[]): SimaSizeMod[] {
  const at = (name: string) => {
    const i = headers.indexOf(name);
    return i !== -1 ? (record[i] ?? '') : '';
  };
  const params = splitList(at('Модификации: Параметры'));
  const sids = splitList(at('Модификации: Артикулы'));
  const prices = splitList(at('Модификации: Цены'));
  const stocks = splitList(at('Модификации: Остатки'));
  const availability = splitList(at('Модификации: Наличие'));

  if (params.length > 0) {
    return params.map((size, i) => ({
      size,
      sid: sids[i] ? parseInt(sids[i], 10) : undefined,
      price: prices[i] ? toNumber(prices[i]) : undefined,
      stock: availability[i] && !/^да$/i.test(availability[i]) ? 0 : parseStock(stocks[i]),
    }));
  }

  const fromBlob = parseModsBlob(at('Модификации'));
  if (fromBlob.length > 0) return fromBlob;

  // Совсем без модификаций: размеры списком из «Размер», без sid-ов размеров
  const sizes = splitList(at('Размер'));
  if (sizes.length > 0) {
    return sizes.map((size) => ({ size, stock: 0 }));
  }
  return [];
}

export function parseSimaExport(buffer: Buffer): SimaParseResult {
  const content = buffer.toString('utf8').replace(BOM, '');
  const records: string[][] = parse(content, {
    delimiter: ';',
    skip_empty_lines: true,
    relax_column_count: true,
  });
  if (records.length < 2) {
    throw new Error('Файл пуст или содержит только заголовки');
  }

  const headers = records[0].map((h) => h.trim().replace(/^"|"$/g, ''));
  const idx = (name: string) => headers.indexOf(name);
  const at = (record: string[], i: number) => (i !== -1 ? (record[i] ?? '') : '');

  const need = ['Артикул', 'Заголовок'];
  for (const name of need) {
    if (idx(name) === -1) {
      throw new Error(
        `Это не похоже на выгрузку Сималенда: нет колонки «${name}»`,
      );
    }
  }

  const rows: SimaExportRow[] = [];
  let skippedNoSid = 0;

  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    if (!record || record.every((c) => !c.trim())) continue;

    // Мультистрочные ячейки: облако-парсер продолжает строку файла без
    // кавычек — склеиваем огрызки до полной колонки через csv-parse
    // (relax_column_count), поэтому строка без «Артикул» и «Заголовок»
    // после первой полноценной — продолжение предыдущей и уже съедена
    // парсером внутрь кавычек. Если огрызок всё же вылез отдельно — пропускаем.
    const sidRaw = at(record, idx('Артикул')).trim();
    const title = at(record, idx('Заголовок')).trim();
    const sid = parseInt(sidRaw.replace(/\D/g, ''), 10);
    if (!sidRaw || !Number.isFinite(sid) || !title) {
      skippedNoSid++;
      continue;
    }

    const images = splitList(at(record, idx('Изображения')));
    rows.push({
      rowNum: i + 1,
      sid,
      title,
      retailPrice: toNumber(at(record, idx('Цена'))),
      wholesalePrice: toNumber(at(record, idx('Крупный опт'))),
      stock: parseStock(at(record, idx('Остаток'))),
      description: at(record, idx('Описание')).trim(),
      images: images.slice(0, 10),
      manufacturer: at(record, idx('Производитель')).trim(),
      color: at(record, idx('Цвет')).trim(),
      composition: at(record, idx('Состав')).trim(),
      fabric: at(record, idx('Ткань')).trim(),
      barcode: at(record, idx('Штрихкод')).split(';')[0]?.trim() || '',
      genderCategory: at(record, idx('Категория 2')).trim(),
      subCategory: at(record, idx('Категория 4')).trim(),
      sizes: buildSizes(headers, record),
    });
  }

  return { rows, totalRows: records.length - 1, skippedNoSid };
}
