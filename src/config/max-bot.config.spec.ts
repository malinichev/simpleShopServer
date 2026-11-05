import maxBotConfig from './max-bot.config';

const KEYS = [
  'NODE_ENV',
  'MAX_BOT_TOKEN',
  'MAX_ALERT_CHAT_ID',
  'MAX_ALERTS_ENABLED',
] as const;

type EnvKey = (typeof KEYS)[number];

describe('maxBot config: политика включения алертов', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    KEYS.forEach((key) => {
      saved[key] = process.env[key];
    });
  });

  afterAll(() => {
    KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  const setEnv = (env: Partial<Record<EnvKey, string>>) => {
    KEYS.forEach((key) => {
      const value = env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  };

  it('dev с токеном и чатом — выключен (алерты только из прода)', () => {
    setEnv({
      NODE_ENV: 'development',
      MAX_BOT_TOKEN: 'token',
      MAX_ALERT_CHAT_ID: 'chat',
    });
    expect(maxBotConfig().enabled).toBe(false);
  });

  it('production с токеном и чатом — включен', () => {
    setEnv({
      NODE_ENV: 'production',
      MAX_BOT_TOKEN: 'token',
      MAX_ALERT_CHAT_ID: 'chat',
    });
    expect(maxBotConfig().enabled).toBe(true);
  });

  it('dev + MAX_ALERTS_ENABLED=true — включен (ручная проверка алертов)', () => {
    setEnv({
      NODE_ENV: 'development',
      MAX_ALERTS_ENABLED: 'true',
      MAX_BOT_TOKEN: 'token',
      MAX_ALERT_CHAT_ID: 'chat',
    });
    expect(maxBotConfig().enabled).toBe(true);
  });

  it('production без токена — выключен', () => {
    setEnv({ NODE_ENV: 'production' });
    expect(maxBotConfig().enabled).toBe(false);
  });

  it('test-окружение — выключен', () => {
    setEnv({
      NODE_ENV: 'test',
      MAX_BOT_TOKEN: 'token',
      MAX_ALERT_CHAT_ID: 'chat',
    });
    expect(maxBotConfig().enabled).toBe(false);
  });
});
