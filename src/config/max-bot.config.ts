import { registerAs } from '@nestjs/config';

/**
 * Бот в MAX (platform-api2.max.ru) — приёмник алертов об ошибках.
 * Без токена/чата нотификатор полностью выключен (логи не страдают).
 *
 * Алерты идут только из production: dev/e2e-прогоны не спамят бот, даже
 * если .env.development случайно синхронизирован с продом. Включить
 * вручную вне прода — MAX_ALERTS_ENABLED=true (+ токен и чат в env).
 */
export default registerAs('maxBot', () => {
  const token = process.env.MAX_BOT_TOKEN || '';
  const chatId = process.env.MAX_ALERT_CHAT_ID || '';
  const isProd = process.env.NODE_ENV === 'production';
  const forced = process.env.MAX_ALERTS_ENABLED === 'true';
  return {
    token,
    chatId,
    apiUrl: process.env.MAX_API_URL || 'https://platform-api2.max.ru',
    get enabled(): boolean {
      return (isProd || forced) && Boolean(token && chatId);
    },
  };
});
