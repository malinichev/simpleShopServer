import {
  AlertGate,
  dedupKey,
  formatAlert,
  shouldAlert,
  type AlertRecord,
} from './max-alert-core';

const ERROR: AlertRecord = { level: 'error', msg: 'boom' };
const FATAL: AlertRecord = { level: 'fatal', msg: 'dead' };
const WARN: AlertRecord = { level: 'warn', msg: 'w' };
const INFO: AlertRecord = { level: 'info', msg: 'i' };

describe('shouldAlert', () => {
  it('error и fatal всегда уходят в MAX', () => {
    expect(shouldAlert(ERROR)).toBe(true);
    expect(shouldAlert(FATAL)).toBe(true);
  });

  it('info/warn молчат без явного флага alert', () => {
    expect(shouldAlert(WARN)).toBe(false);
    expect(shouldAlert(INFO)).toBe(false);
  });

  it('warn/info с alert:true (бизнес-событие) уходят', () => {
    expect(shouldAlert({ ...WARN, alert: true })).toBe(true);
    expect(shouldAlert({ ...INFO, alert: true })).toBe(false);
  });
});

describe('dedupKey', () => {
  it('различает контексты, игнорирует хвост многострочного сообщения', () => {
    const a = dedupKey({
      level: 'error',
      msg: 'boom\n  at line 2',
      context: 'A',
    });
    const b = dedupKey({ level: 'error', msg: 'boom', context: 'A' });
    const c = dedupKey({ level: 'error', msg: 'boom', context: 'B' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('AlertGate', () => {
  function makeGate(
    overrides?: Partial<ConstructorParameters<typeof AlertGate>[0]>,
  ) {
    let now = 1_000_000;
    const gate = new AlertGate({
      cooldownMs: 600_000,
      windowMs: 300_000,
      capacity: 3,
      now: () => now,
      ...overrides,
    });
    return {
      gate,
      tick: (ms: number) => {
        now += ms;
      },
    };
  }

  it('одна и та же ошибка внутри cooldown не дублируется', () => {
    const { gate, tick } = makeGate();
    expect(gate.check({ ...ERROR, msg: 'same', context: 'X' })).toBe('send');
    tick(1_000);
    expect(gate.check({ ...ERROR, msg: 'same', context: 'X' })).toBe(
      'skip-duplicate',
    );
    expect(gate.takeSuppressedCount()).toBe(1);
  });

  it('после cooldown та же ошибка проходит снова', () => {
    const { gate, tick } = makeGate();
    expect(gate.check({ ...ERROR, msg: 'same', context: 'X' })).toBe('send');
    tick(600_001);
    expect(gate.check({ ...ERROR, msg: 'same', context: 'X' })).toBe('send');
  });

  it('каскад разных ошибок режется по capacity окна', () => {
    const { gate } = makeGate(); // capacity: 3
    expect(gate.check({ ...ERROR, msg: 'e1' })).toBe('send');
    expect(gate.check({ ...ERROR, msg: 'e2' })).toBe('send');
    expect(gate.check({ ...ERROR, msg: 'e3' })).toBe('send');
    expect(gate.check({ ...ERROR, msg: 'e4' })).toBe('skip-duplicate');
    expect(gate.check({ ...ERROR, msg: 'e5' })).toBe('skip-duplicate');
    expect(gate.takeSuppressedCount()).toBe(2);
  });

  it('окно сдвигается: после windowMs снова есть место', () => {
    const { gate, tick } = makeGate();
    for (const m of ['e1', 'e2', 'e3']) {
      expect(gate.check({ ...ERROR, msg: m })).toBe('send');
    }
    expect(gate.check({ ...ERROR, msg: 'e4' })).toBe('skip-duplicate');
    tick(300_001);
    expect(gate.check({ ...ERROR, msg: 'e4' })).toBe('send');
  });

  it('не-алертные записи (info) не занимают место в окне', () => {
    const { gate } = makeGate({ capacity: 1 });
    expect(gate.check(INFO)).toBe('skip-silent');
    expect(gate.check({ ...ERROR, msg: 'e1' })).toBe('send');
  });
});

describe('formatAlert', () => {
  it('включает уровень, контекст и след', () => {
    const text = formatAlert({
      level: 'error',
      msg: 'boom',
      context: 'PaymentsService',
      requestId: 'req-42',
      orderId: 'o-9',
    });
    expect(text).toContain('[ERROR] PaymentsService');
    expect(text).toContain('boom');
    expect(text).toContain('req-42');
    expect(text).toContain('o-9');
  });

  it('обрезает длинные сообщения', () => {
    const text = formatAlert({ level: 'error', msg: 'x'.repeat(5000) });
    expect(text.length).toBeLessThanOrEqual(3500);
  });
});
