import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ImageGenDriver } from './image-gen-driver.interface';
import { StubImageDriver } from './stub.driver';
import { RouterAiImageDriver } from './routerai.driver';

/**
 * Активный драйвер ИИ-генерации по env (паттерн payments/drivers/index.ts):
 *  - AI_IMAGE_DRIVER=stub → локальная заглушка (дефолт, безопасно без ключа);
 *  - AI_IMAGE_DRIVER=openai (+ AI_API_KEY) → RouterAI / OpenAI-совместимый API.
 * Если реальный драйвер запрошен, но ключа нет — null: модуль сообщает
 * «ИИ-генерация не настроена» вместо молчаливых падений на этапе воркера.
 */
export function createImageGenDriver(
  configService: ConfigService,
): ImageGenDriver | null {
  const logger = new Logger('ImageGenDriverFactory');
  const driver = configService.get<string>('ai.imageDriver');

  if (driver === 'stub') {
    logger.log('Image generation driver: stub (local placeholder)');
    return new StubImageDriver();
  }

  if (driver === 'openai') {
    if (!configService.get<string>('ai.apiKey')) {
      logger.warn(
        'AI_IMAGE_DRIVER=openai, но AI_API_KEY не задан — генерация отключена',
      );
      return null;
    }
    logger.log(
      `Image generation driver: openai-compatible (${configService.get<string>('ai.apiBaseUrl')})`,
    );
    return new RouterAiImageDriver(configService);
  }

  logger.warn(`Unknown AI_IMAGE_DRIVER "${driver}" — генерация отключена`);
  return null;
}

export { IMAGE_GEN_DRIVER } from './image-gen-driver.interface';
export { StubImageDriver } from './stub.driver';
export { RouterAiImageDriver } from './routerai.driver';
