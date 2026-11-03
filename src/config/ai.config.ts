import { registerAs } from '@nestjs/config';

/**
 * ИИ-генерация фото товара (модуль image-regen).
 *
 * Драйверы:
 *  - `stub`  — локальная заглушка (sharp-плашшка), без внешних вызовов;
 *              безопасный дефолт, весь флоу работает без ключа.
 *  - `openai` — OpenAI-совместимый Images API (`POST /images/edits`),
 *              используется для RouterAI (api.routerai.ru). Боевой endpoint
 *              переопределяется через AI_API_BASE_URL — на него же указывает
 *              локальный эмулятор из e2e-прогона (паттерн YooKassa-драйвера).
 */
export default registerAs('ai', () => ({
  imageDriver: process.env.AI_IMAGE_DRIVER || 'stub',
  apiBaseUrl: process.env.AI_API_BASE_URL || 'https://routerai.ru/api/v1',
  apiKey: process.env.AI_API_KEY || '',
  // gpt-image-1 у апстрима RouterAI недоступен (проверено 2026-11-02);
  // рабочие альтернативы для /images/edits: google/gemini-2.5-flash-image,
  // bytedance-seed/seedream-5-0-flash (дешевле), openai/gpt-image-2
  imageModel: process.env.AI_IMAGE_MODEL || 'openai/gpt-image-2',
  // Дешёвая vision-модель для предгенерационного анализа фото (chat/completions)
  visionModel: process.env.AI_VISION_MODEL || 'google/gemini-2.5-flash',
  imageSize: process.env.AI_IMAGE_SIZE || '1024x1536',
  timeoutMs: parseInt(process.env.AI_IMAGE_TIMEOUT_MS || '180000', 10),
}));
