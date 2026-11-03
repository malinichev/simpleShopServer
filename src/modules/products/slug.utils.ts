/**
 * Slug для товара/категории: транслитерация RU→lat + очистка.
 * Админка делает то же самое на клиенте (BasicInfoSection.toSlug) — карта
 * символов синхронизирована. Нужна и на сервере: путь CSV-импорта и любые
 * товары без явного slug получают generateSlug(name), а slugify без карты
 * кириллицу просто выкидывает («Комбинезон розовый» → пусто).
 */

const RU_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

/** «Комбинезон FlexOne (розовый)» → «kombinezon-flexone-rozovyy» */
export function translitRuToLat(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => RU_MAP[ch] ?? ch)
    .join('');
}

/** Транслит + только [a-z0-9-], пробелы/подчёркивания → дефис, без дублей дефисов. */
export function makeSlug(name: string): string {
  return translitRuToLat(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
