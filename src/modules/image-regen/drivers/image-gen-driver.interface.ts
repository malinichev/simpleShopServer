/**
 * Интерфейс драйвера ИИ для фото товара:
 *  - editImage — img2img генерация (исходное фото + промпт → новые);
 *  - analyzeGarment — vision-анализ выбранных фото перед генерацией
 *    (что за вещь → какие сцены/модель/интерьер подходят под концепцию магазина).
 *
 * Реализации: RouterAiImageDriver (OpenAI-совместимый API, бой — RouterAI)
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

/** Предложенная сцена под конкретную вещь: название для админа + промпт для модели. */
export interface GarmentSceneSuggestion {
  /** RU, напр. «Чай перед сном». */
  title: string;
  /** EN — готовый кусок сцены для промпта генерации. */
  prompt: string;
}

/** Результат vision-анализа выбранных фото (поля — русские, для карточки в админке). */
export interface GarmentAnalysis {
  /** Что за вещь, напр. «Женская пижама в горошек». */
  garmentType: string;
  /** Цвет/принт вещи. */
  color: string;
  /** Стилевое настроение вещи. */
  styleMood: string;
  /** Кого показать в кадре (возраст, типаж, взаимосвязь с вещью). */
  modelNote: string;
  /** Особенности вещи, важные для генерации (детали кроя, принта, ткани). */
  notes: string;
  /** 2–3 сцены под концепцию магазина и эту вещь. */
  scenes: GarmentSceneSuggestion[];
}

export interface AnalyzeGarmentInput {
  images: Array<{ buffer: Buffer; mimeType: string }>;
  /** Базовый промпт стиля магазина (настройки → ИИ-фото) — концепция для подбора сцен. */
  concept: string;
}

export interface ImageGenDriver {
  readonly driverName: string;
  editImage(input: ImageEditInput): Promise<GeneratedImage[]>;
  analyzeGarment(input: AnalyzeGarmentInput): Promise<GarmentAnalysis>;
}

/** Token для условной регистрации активного драйвера в модуле. */
export const IMAGE_GEN_DRIVER = Symbol('IMAGE_GEN_DRIVER');
