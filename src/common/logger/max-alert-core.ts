/**
 * Чистая логика алертинга в MAX (без I/O) — отдельно от стрима/отправки,
 * чтобы дедупликацию и троттлинг можно было покрыть unit-тестами.
 */

export interface AlertRecord {
  level: string;
  msg: string;
  context?: string;
  requestId?: string;
  userId?: string;
  orderId?: string;
  /** Явная метка «прислать в MAX» для событий ниже error (напр. новый заказ). */
  alert?: boolean;
}

export type AlertDecision = 'send' | 'skip-silent' | 'skip-duplicate';

export interface AlertGateOptions {
  /** Один и тот же ключ не чаще, чем раз в cooldownMs. */
  cooldownMs: number;
  /** Максимум отправок за окно windowMs; сверх — подавление. */
  windowMs: number;
  capacity: number;
  now?: () => number;
}

const PINO_LEVELS: Record<string, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

function levelValue(level: string): number {
  return PINO_LEVELS[level] ?? 0;
}

/** В MAX уходят: error+ всегда; warn/info — только с явным флагом alert. */
export function shouldAlert(record: AlertRecord): boolean {
  if (levelValue(record.level) >= PINO_LEVELS.error) return true;
  if (record.alert === true && levelValue(record.level) >= PINO_LEVELS.warn) {
    return true;
  }
  return false;
}

/** Ключ дедупликации: контекст + первая строка сообщения (+ err.type). */
export function dedupKey(record: AlertRecord): string {
  const firstLine = String(record.msg ?? '')
    .split('\n')[0]
    .slice(0, 160);
  return `${record.context ?? '-'}|${firstLine}`;
}

/**
 * Анти-спам шлюз: дедуп по ключу + скользящее окно на общий поток алертов
 * (чтобы каскадная ошибка не устроила DoS чата).
 */
export class AlertGate {
  private readonly lastSent = new Map<string, number>();
  private readonly windowStarts: number[] = [];
  suppressedSinceNotice = 0;

  constructor(private readonly options: AlertGateOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  check(record: AlertRecord): AlertDecision {
    if (!shouldAlert(record)) return 'skip-silent';

    const now = this.now();
    const key = dedupKey(record);

    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < this.options.cooldownMs) {
      this.suppressedSinceNotice += 1;
      return 'skip-duplicate';
    }

    // Скользящее окно: выкидываем истёкшие метки времени отправок
    while (
      this.windowStarts.length > 0 &&
      now - this.windowStarts[0] > this.options.windowMs
    ) {
      this.windowStarts.shift();
    }

    if (this.windowStarts.length >= this.options.capacity) {
      this.suppressedSinceNotice += 1;
      return 'skip-duplicate';
    }

    this.lastSent.set(key, now);
    this.windowStarts.push(now);
    return 'send';
  }

  /** Чистка памяти от протухших ключей (вызывать изредка). */
  prune(): void {
    const now = this.now();
    for (const [key, ts] of this.lastSent) {
      if (now - ts > this.options.cooldownMs * 4) {
        this.lastSent.delete(key);
      }
    }
  }

  /** Сколько сообщений было подавлено с последней отправки (для сноски). */
  takeSuppressedCount(): number {
    const n = this.suppressedSinceNotice;
    this.suppressedSinceNotice = 0;
    return n;
  }
}

/** Текст сообщения в MAX. Коротко: уровень, контекст, сообщение, след. */
export function formatAlert(record: AlertRecord, suppressed = 0): string {
  const icon = levelValue(record.level) >= 60 ? '💥' : '🚨';
  const lines = [
    `${icon} [${record.level.toUpperCase()}] ${record.context ?? 'app'}`,
    String(record.msg ?? '').slice(0, 1500),
  ];
  if (record.orderId) lines.push(`🛒 order: ${record.orderId}`);
  if (record.requestId) lines.push(`🔗 req: ${record.requestId}`);
  if (record.userId) lines.push(`👤 user: ${record.userId}`);
  if (suppressed > 0) lines.push(`(+${suppressed} подавлено дедупом)`);
  return lines.filter(Boolean).join('\n').slice(0, 3500);
}
