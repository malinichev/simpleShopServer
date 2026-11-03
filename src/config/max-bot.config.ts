import { registerAs } from '@nestjs/config';

/**
 * Бот в MAX (platform-api2.max.ru) — приёмник алертов об ошибках.
 * Без токена/чата нотификатор полностью выключен (логи не страдают).
 */
export default registerAs('maxBot', () => ({
  token: process.env.MAX_BOT_TOKEN || '',
  chatId: process.env.MAX_ALERT_CHAT_ID || '',
  apiUrl: process.env.MAX_API_URL || 'https://platform-api2.max.ru',
  get enabled(): boolean {
    return Boolean(process.env.MAX_BOT_TOKEN && process.env.MAX_ALERT_CHAT_ID);
  },
}));
