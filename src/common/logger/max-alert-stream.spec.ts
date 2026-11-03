import { AlertGate } from './max-alert-core';
import { MaxAlertStream } from './max-alert-stream';

type NotifyMock = jest.Mock<Promise<boolean>, [string]>;

function makeStream(notify: NotifyMock, pretty?: { write: jest.Mock } | null) {
  const gate = new AlertGate({
    cooldownMs: 600_000,
    windowMs: 300_000,
    capacity: 20,
  });
  const stream = new MaxAlertStream({
    gate,
    notify,
    pretty: pretty ?? { write: jest.fn() },
    enabled: true,
  });
  return { stream, notify };
}

describe('MaxAlertStream', () => {
  it('error-строка пино превращается в алерт, info — нет', () => {
    const notify = jest
      .fn<Promise<boolean>, [string]>()
      .mockResolvedValue(true);
    const { stream } = makeStream(notify);

    stream.write(
      JSON.stringify({ level: 'info', msg: 'Request completed', time: 't' }),
    );
    expect(notify).not.toHaveBeenCalled();

    stream.write(
      JSON.stringify({
        level: 'error',
        msg: 'boom',
        context: { name: 'OrdersService' },
        requestId: 'r-1',
        orderId: 'o-1',
      }),
    );
    expect(notify).toHaveBeenCalledTimes(1);
    const text = notify.mock.calls[0][0];
    expect(text).toContain('[ERROR] OrdersService');
    expect(text).toContain('boom');
    expect(text).toContain('r-1');
  });

  it('бизнес-событие warn с alert:true уходит в MAX', () => {
    const notify = jest
      .fn<Promise<boolean>, [string]>()
      .mockResolvedValue(true);
    const { stream } = makeStream(notify);

    stream.write(
      JSON.stringify({
        level: 'warn',
        alert: true,
        msg: 'Новый заказ SP-2026-000001',
        context: { name: 'OrdersService' },
      }),
    );
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('выключенный нотификатор не вызывает notify, но пишет в stdout-ветку', () => {
    const notify = jest.fn().mockResolvedValue(true);
    const pretty = { write: jest.fn() };
    const gate = new AlertGate({
      cooldownMs: 600_000,
      windowMs: 300_000,
      capacity: 20,
    });
    const stream = new MaxAlertStream({
      gate,
      notify,
      pretty,
      enabled: false,
    });

    stream.write(JSON.stringify({ level: 'error', msg: 'x' }));
    expect(notify).not.toHaveBeenCalled();
    expect(pretty.write).toHaveBeenCalledTimes(1);
  });

  it('не падает на битой JSON-строке', () => {
    const notify = jest
      .fn<Promise<boolean>, [string]>()
      .mockResolvedValue(true);
    const { stream } = makeStream(notify);
    expect(() => stream.write('не json')).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });
});
