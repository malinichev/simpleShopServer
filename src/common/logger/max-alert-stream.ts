import type { DestinationStream } from 'pino';
import { AlertGate, AlertRecord, formatAlert } from './max-alert-core';

export interface MaxAlertStreamOptions {
  gate: AlertGate;
  notify: (text: string) => Promise<boolean>;
  /** Dev: прогоняем строку через pino-pretty вместо сырого stdout. */
  pretty?: { write: (line: string) => void } | null;
  /** MAX не сконфигурирован — просто пишем (stdout|pretty). */
  enabled: boolean;
}

/**
 * Tee-стрим для pino: каждая строка лога уходит в stdout (pm2 → файл,
 * Vector → VictoriaLogs), а записи, прошедшие AlertGate, — сообщением в MAX.
 *
 * Всё синхронно и защищено: сбой MAX/парсинга не влияет на основной поток.
 */
export class MaxAlertStream implements DestinationStream {
  private lines = 0;

  constructor(private readonly options: MaxAlertStreamOptions) {}

  write(line: string | Uint8Array): void {
    const raw =
      typeof line === 'string' ? line : Buffer.from(line).toString('utf8');

    if (this.options.pretty) {
      this.options.pretty.write(raw);
    } else {
      process.stdout.write(raw);
    }

    if (!this.options.enabled) return;

    try {
      const record = this.toRecord(JSON.parse(raw) as Record<string, unknown>);
      if (this.options.gate.check(record) === 'send') {
        const suppressed = this.options.gate.takeSuppressedCount();
        void this.options.notify(formatAlert(record, suppressed));
      }
      // Раз в ~2000 строк подчищаем Map дедупликации
      if (++this.lines % 2000 === 0) this.options.gate.prune();
    } catch {
      // Битая/нестроковая запись — не должна ломать вывод
    }
  }

  private toRecord(parsed: Record<string, unknown>): AlertRecord {
    return {
      level: toStr(parsed.level) ?? 'info',
      msg: toStr(parsed.msg) ?? '',
      context:
        toStr(parsed.context) ??
        (typeof parsed.context === 'object' && parsed.context !== null
          ? toStr((parsed.context as { name?: unknown }).name)
          : undefined),
      requestId: toStr(parsed.requestId),
      userId: toStr(parsed.userId),
      orderId: toStr(parsed.orderId),
      alert: parsed.alert === true,
    };
  }
}

function toStr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
