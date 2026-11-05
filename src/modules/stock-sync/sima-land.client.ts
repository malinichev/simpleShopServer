import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'node:http';
import * as https from 'node:https';
import { assertFetchableApiUrl } from './stock-sync.utils';

/** Одна строка ответа /item/ — один размер (см. docs/research/sima-sync README). */
export interface SimaItem {
  sid: number;
  balance: number;
  min_qty?: number;
  is_disabled?: boolean;
  [key: string]: unknown;
}

export type SimaItemResult =
  | { found: true; item: SimaItem }
  | { found: false; reason: 'not_found' };

const REQUEST_TIMEOUT_MS = 15_000;
/** Точечная проверка при checkout: быстро ответили или сразу fail-open. */
const FAST_CHECK_TIMEOUT_MS = 5_000;
const RETRY_ATTEMPTS = 2;
// 403 у Сималенда — WAF-бан по частоте: после плотной серии IP режется на
// десятки секунд. Ретраим 403 с длинной паузой, прочее — короткий backoff.
const RETRY_DELAYS_MS = [3_000, 10_000];
const WAF_BAN_PAUSE_MS = 45_000;
const MAX_PAGE_REDIRECTS = 3;
// WAF Сималенда с датацентровых IP режет запросы по TLS-фингерпринту undici
// (глобальный fetch) и не-браузерным UA — оба дают мгновенный 403. node:https
// с браузерным UA проходит (проверено на прод-VPS 2026-11-03).
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * Тонкий клиент API Сималенда v3 (только то, что нужно синку остатков).
 * Авторизация: заголовок X-Api-Key (KEY_SIMA_LAND). Боевой endpoint можно
 * переопределить SIMA_LAND_API_URL (e2e-мок); в проде URL проходит SSRF-гард.
 */
@Injectable()
export class SimaLandClient {
  private readonly logger = new Logger(SimaLandClient.name);

  constructor(private readonly configService: ConfigService) {}

  private get base(): string {
    const url = this.configService.get<string>('simaLand.apiBaseUrl') || '';
    assertFetchableApiUrl(url);
    return url.endsWith('/') ? url : `${url}/`;
  }

  private get apiKey(): string {
    return this.configService.get<string>('simaLand.apiKey') || '';
  }

  /** Ключ не настроен — синк не может работать (о конфигурации, не о товаре). */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * HTML-страница товара по голому sid (`/{sid}/` → 301 на слаг → 200).
   * Для скрейпа «Вариантов» (modifier-elements) импортом Сималенда.
   * Редиректы валидируем вручную: Location бывает относительным, а цель
   * обязана оставаться в пределах настроенного pagesBaseUrl.
   */
  async getPageHtml(sid: number): Promise<{ found: true; html: string } | { found: false; reason: 'not_found' }> {
    const origin = new URL(this.pagesBase).origin;
    let url = `${this.pagesBase.replace(/\/$/, '')}/${sid}/`;
    for (let hop = 0; hop <= MAX_PAGE_REDIRECTS; hop++) {
      assertFetchableApiUrl(url);
      if (new URL(url).origin !== origin) {
        throw new Error(`редирект за пределы Сималенда: ${url}`);
      }
      const response = await this.requestText(url, REQUEST_TIMEOUT_MS);
      if (response.status === 404) {
        return { found: false, reason: 'not_found' };
      }
      if (response.status >= 200 && response.status < 300) {
        return { found: true, html: response.text };
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.location;
        if (!location) {
          throw new Error(`редирект без Location: ${url}`);
        }
        url = new URL(location, url).toString(); // относительный Location склеиваем
        continue;
      }
      // 403/429/5xx — один короткий повтор без 45с-паузы (тротлинг делает вызывающий)
      if (hop === 0 && (response.status === 403 || response.status === 429 || response.status >= 500)) {
        await sleep(RETRY_DELAYS_MS[0]);
        hop--;
        continue;
      }
      throw new Error(`страница товара ${sid}: HTTP ${response.status}`);
    }
    throw new Error(`страница товара ${sid}: слишком много редиректов`);
  }

  private get pagesBase(): string {
    const url = this.configService.get<string>('simaLand.pagesBaseUrl') || '';
    assertFetchableApiUrl(url);
    return url.endsWith('/') ? url : `${url}/`;
  }

  /**
   * Остаток конкретного размера по sid. 404 → { found: false } (товар пропал
   * у поставщика — валидный результат синка, не ошибка).
   *
   * `fastCheck`: режим для точечных проверок при checkout — 1 попытка и
   * короткий таймаут, без 403-пауз (WAF-ретраи в 45 с тут недопустимы:
   * покупатель не должен ждать).
   */
  async getItemBySid(
    sid: number,
    opts: { fastCheck?: boolean } = {},
  ): Promise<SimaItemResult> {
    const url = `${this.base}item/?sid=${sid}`;
    const body = await this.fetchJson(url, opts);
    if (body.notFound) {
      return { found: false, reason: 'not_found' };
    }
    const items = this.extractItems(body.json);
    const item = items.find((i) => Number(i.sid) === sid) ?? items[0];
    if (!item) {
      return { found: false, reason: 'not_found' };
    }
    return { found: true, item };
  }

  private extractItems(body: unknown): SimaItem[] {
    if (Array.isArray((body as { items?: unknown })?.items)) {
      return (body as { items: SimaItem[] }).items;
    }
    if (Array.isArray(body)) {
      return body as SimaItem[];
    }
    return [];
  }

  /**
   * Текстовый транспорт для страниц товара (см. getPageHtml): без X-Api-Key
   * (публичные страницы), редиректы НЕ следуются автоматически — Location
   * возвращает вызывающему для ручной валидации.
   */
  private requestText(
    url: string,
    timeoutMs: number,
  ): Promise<{ status: number; text: string; location?: string }> {
    return new Promise((resolve, reject) => {
      const transport = url.startsWith('https:') ? https : http;
      const req = transport.request(
        url,
        {
          headers: {
            Accept: 'text/html',
            'User-Agent': USER_AGENT,
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString('utf8'),
              location: res.headers.location,
            });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (error: Error) => reject(error));
      req.end();
    });
  }

  /**
   * Транспорт: node:http(s).request — НЕ глобальный fetch: undici-ClientHello
   * WAF Сималенда режет 403 с датацентровых IP (см. USER_AGENT).
   * Схему выбираем по URL (https — прод, http — e2e-мок :4012).
   */
  private requestJson(
    url: string,
    timeoutMs: number,
  ): Promise<{ status: number; json: unknown }> {
    return new Promise((resolve, reject) => {
      const transport = url.startsWith('https:') ? https : http;
      const req = transport.request(
        url,
        {
          headers: {
            'X-Api-Key': this.apiKey,
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json: unknown = null;
            try {
              json = JSON.parse(text);
            } catch {
              json = null; // HTML-заглушка WAF и прочий не-JSON
            }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (error: Error) => reject(error));
      req.end();
    });
  }

  private async fetchJson(
    url: string,
    opts: { fastCheck?: boolean } = {},
  ): Promise<{
    notFound?: boolean;
    json: unknown;
  }> {
    if (!this.isConfigured()) {
      throw new Error('KEY_SIMA_LAND не задан — синк остатков не настроен');
    }

    const attempts = opts.fastCheck ? 0 : RETRY_ATTEMPTS;
    const timeoutMs = opts.fastCheck
      ? FAST_CHECK_TIMEOUT_MS
      : REQUEST_TIMEOUT_MS;
    let lastError: Error | null = null;
    let lastWasForbidden = false;
    for (let attempt = 0; attempt <= attempts; attempt++) {
      if (attempt > 0) {
        await sleep(
          lastWasForbidden
            ? WAF_BAN_PAUSE_MS
            : (RETRY_DELAYS_MS[attempt - 1] ?? 3_000),
        );
      }
      let response: { status: number; json: unknown };
      try {
        response = await this.requestJson(url, timeoutMs);
      } catch (error: unknown) {
        lastError = new Error(
          `сеть/таймаут: ${(error as Error).message ?? String(error)}`,
        );
        continue; // retry
      }
      if (response.status === 404) {
        // Нормальный исход: размер снят с продажи. Не ретраим.
        return { notFound: true, json: null };
      }
      if (response.status >= 200 && response.status < 300) {
        return { json: response.json };
      }
      const retryable =
        response.status === 403 || // WAF-бан по частоте — подождать и повторить
        response.status === 429 ||
        response.status >= 500;
      lastWasForbidden = response.status === 403;
      lastError = new Error(`HTTP ${response.status}`);
      if (!retryable) {
        throw new Error(`Sima-land API ${url} → HTTP ${response.status}`);
      }
    }
    this.logger.warn(`Sima-land API ${url} не отвечает: ${lastError?.message}`);
    throw new Error(
      `Sima-land API ${url} → не отвечает после ${RETRY_ATTEMPTS + 1} попыток (${lastError?.message})`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
