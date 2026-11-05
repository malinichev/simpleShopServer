import type { ConfigService } from '@nestjs/config';
import { buildParams } from './app-logger.module';
import { MaxAlertStream } from './max-alert-stream';

/** Стаб ConfigService: отвечает только на переданные maxBot.* ключи. */
function makeConfig(overrides: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in overrides ? overrides[key] : defaultValue,
  } as unknown as ConfigService;
}

function maxStreamEnabled(params: ReturnType<typeof buildParams>): boolean {
  const stream = params.pinoHttp[1] as MaxAlertStream;
  return (stream as unknown as { options: { enabled: boolean } }).options
    .enabled;
}

describe('buildParams: гейт MAX-алертов', () => {
  it('maxBot.enabled=false (dev) — стрим алертов выключен, токен не помогает', () => {
    const params = buildParams(
      makeConfig({
        'maxBot.token': 'token',
        'maxBot.chatId': 'chat',
        'maxBot.enabled': false,
      }),
    );
    expect(maxStreamEnabled(params)).toBe(false);
  });

  it('maxBot.enabled=true (прод) — стрим алертов включен', () => {
    const params = buildParams(
      makeConfig({
        'maxBot.token': 'token',
        'maxBot.chatId': 'chat',
        'maxBot.enabled': true,
      }),
    );
    expect(maxStreamEnabled(params)).toBe(true);
  });
});
