import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SimaModelLink } from './entities/sima-import-job.entity';
import { SimaLandClient } from '@/modules/stock-sync/sima-land.client';
import { parseModifiers } from './modifier-parser';

/**
 * Склейка цветов: страницы товаров → «Варианты»/«Размер» → union-find →
 * modelKey = min sid компоненты. Кэш в sima_model_links — повторные импорты
 * не перекачивают страницы (связи только накапливаются).
 */

const MIN_REQUEST_INTERVAL_MS = 1_200;
const UPSERT_CHUNK = 100;

/** Ключ модели + нормализованное имя цвета для каждого sid. */
export interface ModelLinkMap {
  /** sid → modelKey (min sid компоненты). */
  keys: Map<number, number>;
  /** sid → «Белый»/«Персиковый»… (из «Вариантов»). */
  colors: Map<number, string>;
}

class DSU {
  private parent = new Map<number, number>();

  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== cur) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  members(): number[] {
    return [...this.parent.keys()];
  }
}

@Injectable()
export class ModelLinksService {
  private readonly logger = new Logger(ModelLinksService.name);

  constructor(
    @InjectRepository(SimaModelLink)
    private readonly linksRepo: Repository<SimaModelLink>,
    private readonly simaClient: SimaLandClient,
  ) {}

  /**
   * Склеить цвета для списка sid: сначала накопленный кэш, недостающие
   * страницы докачиваем (1 поток, ≥MIN_REQUEST_INTERVAL_MS — WAF Сималенда).
   * onScrape вызывается после каждой скачанной страницы (прогресс джобы).
   */
  async resolveModelLinks(
    sids: number[],
    onScrape?: (done: number, total: number) => Promise<void> | void,
  ): Promise<ModelLinkMap> {
    const unique = [...new Set(sids.filter((s) => Number.isFinite(s)))];
    const cached = unique.length
      ? await this.linksRepo.find({ where: { sid: In(unique) } })
      : [];

    const dsu = new DSU();
    const colors = new Map<number, string>();

    // 1) связи из кэша: sid'ы с одинаковым modelKey — одна компонента
    const byKey = new Map<number, number[]>();
    for (const link of cached) {
      const list = byKey.get(Number(link.modelKey)) ?? [];
      list.push(Number(link.sid));
      byKey.set(Number(link.modelKey), list);
      if (link.colorName) colors.set(Number(link.sid), link.colorName);
    }
    for (const members of byKey.values()) {
      for (let i = 1; i < members.length; i++) dsu.union(members[0], members[i]);
    }

    // 2) докачиваем страницы для sid'ов, которых нет в кэше
    const cachedSids = new Set(cached.map((l) => Number(l.sid)));
    const toScrape = unique.filter((s) => !cachedSids.has(s));
    let done = 0;
    let nextRequestAt = 0;
    for (const sid of toScrape) {
      const wait = nextRequestAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

      try {
        const page = await this.simaClient.getPageHtml(sid);
        if (page.found) {
          const mods = parseModifiers(page.html);
          for (const { sid: rel } of [...mods.colors, ...mods.sizes]) {
            dsu.union(sid, rel);
          }
          for (const { sid: cs, name } of mods.colors) {
            if (!colors.has(cs)) colors.set(cs, name);
          }
        }
      } catch (error) {
        // страница недоступна — sid останется одиночкой, не роняем импорт
        this.logger.warn(`страница ${sid}: ${(error as Error).message}`);
      }
      done++;
      if (onScrape) await onScrape(done, toScrape.length);
    }

    // 3) компоненты → modelKey = min sid; upsert кэша (в т.ч. склейки ранее
    //    раздельных групп, если новая страница связала старые ключи)
    const components = new Map<number, number[]>();
    for (const sid of dsu.members()) {
      const root = dsu.find(sid);
      const list = components.get(root) ?? [];
      list.push(sid);
      components.set(root, list);
    }
    const keyOf = new Map<number, number>();
    const rows: Array<{ sid: number; modelKey: number; colorName: string | null }> = [];
    for (const members of components.values()) {
      const key = Math.min(...members);
      for (const sid of members) {
        keyOf.set(sid, key);
        rows.push({ sid, modelKey: key, colorName: colors.get(sid) ?? null });
      }
    }
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      await this.linksRepo.upsert(rows.slice(i, i + UPSERT_CHUNK), ['sid']);
    }
    // одиночкам без страницы — собственный ключ, чтобы modelId был у всех
    for (const sid of unique) {
      if (!keyOf.has(sid)) keyOf.set(sid, sid);
    }
    return { keys: keyOf, colors };
  }

  /** Быстрый просмотр по кэшу без скрейпа (для превью). */
  async cachedLinks(sids: number[]): Promise<ModelLinkMap> {
    const unique = [...new Set(sids.filter((s) => Number.isFinite(s)))];
    const cached = unique.length
      ? await this.linksRepo.find({ where: { sid: In(unique) } })
      : [];
    const keys = new Map<number, number>();
    const colors = new Map<number, string>();
    for (const link of cached) {
      keys.set(Number(link.sid), Number(link.modelKey));
      if (link.colorName) colors.set(Number(link.sid), link.colorName);
    }
    return { keys, colors };
  }
}
