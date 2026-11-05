/**
 * Парсер блока modifier-elements из SSR-состояния страницы товара Сималенда.
 * TS-порт проверенного питон-парсера (docs/research/sima-sync-2026-11-03/
 * fetch_model_links.py): единственный источник связи цветов — API v3/v5 и
 * выгрузка cloudparser её не дают.
 *
 * «Варианты» на странице = цвета В РАЗМЕРЕ этой страницы, поэтому для полной
 * картины качать страницы всех sid выборки (см. README sima-sync).
 */

export interface ParsedModifiers {
  colors: Array<{ sid: number; name: string }>;
  sizes: Array<{ sid: number; name: string }>;
}

/** SSR-состояние лежит в JS-строках: \uXXXX — приводим к читаемому виду. */
function unescapeUnicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

const PAIR_PATTERN = /itemSid\\?"?:(\d+),\\?"?name\\?"?:\\?"([^"\\,}]+)/g;

/** Пары (sid, имя) из куска SSR-JSON; терпимы к экранированным кавычкам. */
function extractPairs(segment: string): Array<{ sid: number; name: string }> {
  const out: Array<{ sid: number; name: string }> = [];
  for (const match of segment.matchAll(PAIR_PATTERN)) {
    out.push({ sid: parseInt(match[1], 10), name: match[2] });
  }
  return out;
}

/**
 * {'colors': [{sid, name:'Белый'}, ...], 'sizes': [{sid, name:'54'}, ...]}.
 * Обрабатывает обе формы кавычек: сырой JSON («title":"Варианты"») и
 * экранированный внутри JS-строки (\"title\":\"Варианты\").
 */
export function parseModifiers(html: string): ParsedModifiers {
  const text = unescapeUnicode(html);
  const out: ParsedModifiers = { colors: [], sizes: [] };
  const sections: Array<[string, 'colors' | 'sizes']> = [
    ['Варианты', 'colors'],
    ['Размер', 'sizes'],
  ];
  for (const [title, key] of sections) {
    const templates = [
      `"title":"${title}"`,
      `\\"title\\":\\"${title}\\"`,
    ];
    for (const tpl of templates) {
      const i = text.indexOf(tpl);
      if (i === -1) continue;
      // до следующей секции title, не дальше 30Кб
      const window = text.slice(i + 20, i + 30_000);
      const next = window.search(/title\\?"?:\\?"?(?:Варианты|Размер)/);
      const segment = text.slice(i, i + 20 + (next !== -1 ? next : 30_000));
      const pairs = extractPairs(segment);
      if (pairs.length > 0) out[key] = pairs;
      break;
    }
  }
  return out;
}
