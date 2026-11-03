import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MaxNotifierConfig {
  token: string;
  chatId: string;
  apiUrl: string;
}

/**
 * Корневой сертификат НУЦ (Минцифры) — им подписан platform-api2.max.ru.
 * Node не знает его из коробки (не в Mozilla-наборе node), поэтому подключаем
 * явно. Публичный корневой сертификат, доступен с сайта Минцифры.
 */
let russianRootCa: string | undefined;
try {
  russianRootCa = readFileSync(
    join(__dirname, 'certs/russian-trusted-root-ca.pem'),
    'utf8',
  );
} catch {
  russianRootCa = undefined;
}

function httpsPostJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpsRequest(
      {
        hostname: target.hostname,
        port: 443,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        ca: russianRootCa,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Отправка одного сообщения ботом в MAX (node:https: и CA НУЦ, и WAF-frendly).
 * Никогда не бросает — false при любой ошибке: алерт не имеет права уронить
 * логирование или пользовательский запрос.
 *
 * API: POST {apiUrl}/messages?chat_id=..., заголовок Authorization: <token>,
 * тело { "text": "..." } — https://dev.max.ru/docs-api
 */
export async function sendMaxMessage(
  text: string,
  config: MaxNotifierConfig,
): Promise<boolean> {
  if (!config.token || !config.chatId || !config.apiUrl) return false;

  const url = `${config.apiUrl}/messages?chat_id=${encodeURIComponent(config.chatId)}`;

  try {
    const res = await httpsPostJson(
      url,
      {
        Authorization: config.token,
        'Content-Type': 'application/json',
        // Нейтральный UA: часть RU-провайдеров режет дефолтный node/undici
        'User-Agent': 'svoybrand-observability/1.0',
      },
      JSON.stringify({ text }),
      10_000,
    );

    if (res.status < 200 || res.status >= 300) {
      process.stderr.write(
        `[max-notifier] HTTP ${res.status} от MAX: ${res.text.slice(0, 300)}\n`,
      );
      return false;
    }
    return true;
  } catch (error) {
    process.stderr.write(
      `[max-notifier] не отправилось в MAX: ${(error as Error).message}\n`,
    );
    return false;
  }
}
