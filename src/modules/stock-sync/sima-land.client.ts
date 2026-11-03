import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
const RETRY_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [1_000, 3_000];

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
   * Остаток конкретного размера по sid. 404 → { found: false } (товар пропал
   * у поставщика — валидный результат синка, не ошибка).
   */
  async getItemBySid(sid: number): Promise<SimaItemResult> {
    const url = `${this.base}item/?sid=${sid}`;
    const body = await this.fetchJson(url);
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

  private async fetchJson(url: string): Promise<{
    notFound?: boolean;
    json: unknown;
  }> {
    if (!this.isConfigured()) {
      throw new Error('KEY_SIMA_LAND не задан — синк остатков не настроен');
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 3_000);
      }
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
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
      if (response.ok) {
        const json: unknown = await response.json().catch(() => null);
        return { json };
      }
      const retryable = response.status === 429 || response.status >= 500;
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
