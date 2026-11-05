import { registerAs } from '@nestjs/config';

/**
 * Поставщик Sima-land (синк остатков каталога SL-*).
 *
 * `SIMA_LAND_API_URL` переопределяет боевой endpoint — на него указывает
 * локальный мок e2e-прогона (:4012). В ПРОДУ не задавать (паттерн
 * YOOKASSA_API_URL / AI_API_BASE_URL): в проде разрешён только публичный
 * https-адрес Сималенда (см. assertFetchableApiUrl).
 */
export default registerAs('simaLand', () => ({
  apiBaseUrl:
    process.env.SIMA_LAND_API_URL || 'https://www.sima-land.ru/api/v3/',
  apiKey: process.env.KEY_SIMA_LAND || '',
  /**
   * База страниц товаров (скрейп «Вариантов» для импорта Сималенда).
   * SIMA_LAND_PAGES_URL переопределяется на локальный мок в e2e; в проде
   * не задавать — действует SSRF-гард (assertFetchableApiUrl).
   */
  pagesBaseUrl:
    process.env.SIMA_LAND_PAGES_URL || 'https://www.sima-land.ru/',
}));
