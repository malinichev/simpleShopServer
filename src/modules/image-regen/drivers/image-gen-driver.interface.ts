/**
 * Интерфейс драйвера ИИ-генерации фото (img2img: исходное фото + промпт → новые).
 *
 * Реализации: RouterAiImageDriver (OpenAI-совместимый Images API, бой — RouterAI)
 * и StubImageDriver (локальная заглушка без сети). Выбор — env AI_IMAGE_DRIVER,
 * условная регистрация в drivers/index.ts (паттерн payments/drivers).
 */

export interface ImageEditInput {
  /** Байты исходного фото товара. */
  image: Buffer;
  /** MIME исходника ('image/png' | 'image/jpeg' | 'image/webp'). */
  mimeType: string;
  /** Полный собранный промпт (стиль + сцена + тех-требования). */
  prompt: string;
  /** Число вариантов (1–2). */
  n: number;
}

export interface GeneratedImage {
  buffer: Buffer;
}

export interface ImageGenDriver {
  readonly driverName: string;
  editImage(input: ImageEditInput): Promise<GeneratedImage[]>;
}

/** Token для условной регистрации активного драйвера в модуле. */
export const IMAGE_GEN_DRIVER = Symbol('IMAGE_GEN_DRIVER');
