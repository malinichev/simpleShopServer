import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ImageEditInput,
  GeneratedImage,
  ImageGenDriver,
  AnalyzeGarmentInput,
  GarmentAnalysis,
  GarmentSceneSuggestion,
} from './image-gen-driver.interface';

/**
 * Драйвер OpenAI-совместимого Images API (`POST /images/edits`).
 *
 * Боевой провайдер — RouterAI (api.routerai.ru, замена OpenRouter): base URL
 * и модель настраиваются env (AI_API_BASE_URL / AI_IMAGE_MODEL), поэтому
 * тот же драйвер работает с любым OpenAI-совместимым шлюзом. Base URL
 * переопределяется на локальный эмулятор из e2e-прогона (паттерн
 * YooKassa-драйвера: реальный драйвер против мок-сервера, без внешних сетей).
 *
 * `response_format` не передаём: gpt-image-1 всегда отвечает b64_json и
 * параметр отклоняет; ответ понимаем в обоих форматах (b64_json | url).
 */
@Injectable()
export class RouterAiImageDriver implements ImageGenDriver {
  private readonly logger = new Logger(RouterAiImageDriver.name);
  readonly driverName = 'routerai';

  constructor(private readonly configService: ConfigService) {}

  private authHeader(): string {
    const apiKey = this.configService.get<string>('ai.apiKey') || '';
    return `Bearer ${apiKey}`;
  }

  private apiBase(): string {
    return this.configService.get<string>('ai.apiBaseUrl') || '';
  }

  async editImage(input: ImageEditInput): Promise<GeneratedImage[]> {
    const model = this.configService.get<string>('ai.imageModel') || '';
    const size = this.configService.get<string>('ai.imageSize') || '1024x1536';
    const timeoutMs =
      Number(this.configService.get<number | string>('ai.timeoutMs')) ||
      180000;

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', input.prompt);
    form.append('size', size);
    form.append('n', String(input.n));
    const ext = input.mimeType.split('/')[1] || 'png';
    form.append(
      'image',
      new File([new Uint8Array(input.image)], `source.${ext}`, {
        type: input.mimeType,
      }),
    );

    let response: Response;
    try {
      response = await fetch(`${this.apiBase()}/images/edits`, {
        method: 'POST',
        headers: { Authorization: this.authHeader() },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timeout after ${timeoutMs}ms`
          : String(error);
      throw new Error(`RouterAI API /images/edits → network error: ${reason}`);
    }

    const body: unknown = await response.json().catch(() => null);
    // OpenRouter-совместимые шлюзы (в т.ч. RouterAI) возвращают ошибки
    // и с HTTP 200 — в теле {error:{message}}. Проверяем оба случая.
    const providerError =
      (body as { error?: { message?: string } } | null)?.error?.message;
    if (!response.ok || providerError) {
      const description =
        providerError ?? JSON.stringify(body) ?? response.status.toString();
      this.logger.warn(
        `Image edit failed: HTTP ${response.status}: ${description}`,
      );
      throw new Error(
        `RouterAI API /images/edits → ${response.status}: ${description}`,
      );
    }

    const data = (body as { data?: Array<{ b64_json?: string; url?: string }> })
      ?.data;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(
        'RouterAI: unexpected images/edits response (empty data[])',
      );
    }

    const images: GeneratedImage[] = [];
    for (const item of data) {
      if (item.b64_json) {
        images.push({ buffer: Buffer.from(item.b64_json, 'base64') });
      } else if (item.url) {
        // Некоторые шлюзы отдают ссылку вместо b64 — скачиваем
        const fileRes = await fetch(item.url, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!fileRes.ok) {
          throw new Error(
            `RouterAI: не удалось скачать результат (${fileRes.status})`,
          );
        }
        images.push({
          buffer: Buffer.from(await fileRes.arrayBuffer()),
        });
      }
    }
    if (images.length === 0) {
      throw new Error(
        'RouterAI: images/edits response без b64_json/url в data[]',
      );
    }
    return images;
  }

  /**
   * Vision-анализ выбранных фото перед генерацией: распознаём вещь и
   * подбираем сцены/модель/интерьер под концепцию магазина (базовый промпт
   * из настроек). Дешёвая текстовая модель через chat/completions —
   * стоимость на порядки ниже генерации.
   */
  async analyzeGarment(input: AnalyzeGarmentInput): Promise<GarmentAnalysis> {
    const model = this.configService.get<string>('ai.visionModel') || '';
    const timeoutMs =
      Number(this.configService.get<number | string>('ai.timeoutMs')) ||
      180000;

    const systemPrompt =
      'You are the art director of SVOY BRAND, a women\'s homewear and sportswear e-commerce store. ' +
      'Analyze the garment in the attached product photo(s) and suggest photoshoot scenes ' +
      'that fit BOTH the garment and the store concept below.\n\n' +
      `STORE PHOTO CONCEPT:\n"""${input.concept || 'Warm cozy at-home lifestyle photography.'}"""\n\n` +
      'Respond with ONLY valid JSON (no markdown fences, no extra text) with this exact shape:\n' +
      '{"garmentType":"<RU: что за вещь, кратко>","color":"<RU: цвет/принт>","styleMood":"<RU: настроение вещи>",' +
      '"modelNote":"<RU: кого показать в кадре — типаж/возраст/настроение, согласовано с вещью>",' +
      '"notes":"<RU: детали, которые важно сохранить при генерации: крой/принт/ткань>",' +
      '"scenes":[{"title":"<RU: название сцены>","prompt":"<EN: detailed scene prompt — action, place, light, mood, garment is the hero>"}]}\n' +
      'Rules: exactly 2-3 scenes; scene prompts in English, 1-2 sentences each, consistent with the store concept; ' +
      'never suggest text, logos or watermarks on photos; preserve the garment exactly as photographed.';

    const content: Array<Record<string, unknown>> = [{ type: 'text', text: 'Проанализируй фото и предложи сцены.' }];
    for (const img of input.images) {
      const b64 = img.buffer.toString('base64');
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${b64}` },
      });
    }

    let response: Response;
    try {
      response = await fetch(`${this.apiBase()}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `timeout after ${timeoutMs}ms`
          : String(error);
      throw new Error(
        `RouterAI API /chat/completions → network error: ${reason}`,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    const providerError =
      (body as { error?: { message?: string } } | null)?.error?.message;
    if (!response.ok || providerError) {
      const description =
        providerError ?? JSON.stringify(body) ?? response.status.toString();
      throw new Error(
        `RouterAI API /chat/completions → ${response.status}: ${description}`,
      );
    }

    const text = (
      body as { choices?: Array<{ message?: { content?: string } }> } | null
    )?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('RouterAI: chat/completions без message.content');
    }

    const analysis = this.parseAnalysis(text);
    if (!analysis) {
      throw new Error(
        `RouterAI: не удалось разобрать JSON-анализ вещи: ${text.slice(0, 200)}`,
      );
    }
    return analysis;
  }

  /** Модели любят оборачивать JSON в ```json … ``` — чистим и валидируем форму. */
  private parseAnalysis(text: string): GarmentAnalysis | null {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
      const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
      const parsedScenes: GarmentSceneSuggestion[] = scenes
        .filter(
          (s): s is { title: string; prompt: string } =>
            !!s &&
            typeof (s as { title?: unknown }).title === 'string' &&
            typeof (s as { prompt?: unknown }).prompt === 'string',
        )
        .map((s) => ({ title: s.title, prompt: s.prompt }));
      if (parsedScenes.length === 0) return null;
      return {
        garmentType: String(raw.garmentType ?? ''),
        color: String(raw.color ?? ''),
        styleMood: String(raw.styleMood ?? ''),
        modelNote: String(raw.modelNote ?? ''),
        notes: String(raw.notes ?? ''),
        scenes: parsedScenes.slice(0, 3),
      };
    } catch {
      return null;
    }
  }
}
