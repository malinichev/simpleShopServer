import type { ConfigService } from '@nestjs/config';
import { RouterAiImageDriver } from './routerai.driver';

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeConfig(overrides: Record<string, string> = {}) {
  return {
    get: (key: string) =>
      ({
        'ai.apiBaseUrl': 'https://ai.example.test/v1',
        'ai.apiKey': 'test-key',
        'ai.imageModel': 'gpt-image-1',
        'ai.visionModel': 'google/gemini-2.5-flash',
        'ai.imageSize': '1024x1536',
        'ai.timeoutMs': '5000',
        ...overrides,
      })[key],
  } as unknown as ConfigService;
}

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 },
  );
}

describe('RouterAiImageDriver.editImage', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('шлёт multipart на {base}/images/edits c Bearer, model, prompt, size, n и файлом', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_1PX }] }), {
        status: 200,
      }),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    const result = await driver.editImage({
      image: Buffer.from('fake-image-bytes'),
      mimeType: 'image/webp',
      prompt: 'SCENE PROMPT',
      n: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.example.test/v1/images/edits');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get('model')).toBe('gpt-image-1');
    expect(form.get('prompt')).toBe('SCENE PROMPT');
    expect(form.get('size')).toBe('1024x1536');
    expect(form.get('n')).toBe('2');
    const file = form.get('image');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('source.webp');
    expect((file as File).type).toBe('image/webp');

    expect(result).toHaveLength(1);
    expect(result[0].buffer.equals(Buffer.from(PNG_1PX, 'base64'))).toBe(true);
  });

  it('понимает ответ с url вместо b64_json и скачивает файл', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ url: 'https://cdn.example.test/img.png' }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('png-bytes-from-url'), { status: 200 }),
      );

    const driver = new RouterAiImageDriver(makeConfig());
    const result = await driver.editImage({
      image: Buffer.from('x'),
      mimeType: 'image/png',
      prompt: 'p',
      n: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.example.test/img.png');
    expect(result[0].buffer.equals(Buffer.from('png-bytes-from-url'))).toBe(true);
  });

  it('ошибка API → Error со статусом и описанием (паттерн YooKassa-драйвера)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: 'insufficient credits' } }),
        { status: 402 },
      ),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    await expect(
      driver.editImage({
        image: Buffer.from('x'),
        mimeType: 'image/png',
        prompt: 'p',
        n: 1,
      }),
    ).rejects.toThrow('RouterAI API /images/edits → 402: insufficient credits');
  });

  it('ошибка провайдера с HTTP 200 (конверт OpenRouter) → Error с описанием', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "The model 'gpt-image-1' does not exist.", code: 400 },
        }),
        { status: 200 },
      ),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    await expect(
      driver.editImage({
        image: Buffer.from('x'),
        mimeType: 'image/png',
        prompt: 'p',
        n: 1,
      }),
    ).rejects.toThrow("RouterAI API /images/edits → 200: The model 'gpt-image-1' does not exist.");
  });

  it('пустой data[] → понятная ошибка вместо тихого пустого результата', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    await expect(
      driver.editImage({
        image: Buffer.from('x'),
        mimeType: 'image/png',
        prompt: 'p',
        n: 1,
      }),
    ).rejects.toThrow('unexpected images/edits response');
  });
});

describe('RouterAiImageDriver.analyzeGarment — vision-анализ фото', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const input = {
    images: [{ buffer: Buffer.from('img-bytes'), mimeType: 'image/webp' }],
    concept: 'BASE STYLE CONCEPT',
  };

  it('шлёт chat/completions c vision-моделью, концепцией и base64-фото', async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse(
        JSON.stringify({
          garmentType: 'Пижама',
          color: 'розовый',
          styleMood: 'уютное',
          modelNote: 'девушка 25–30',
          notes: 'принт сохранить',
          brandArtifacts: 'вышитый логотип на груди, водяной знак сайта внизу',
          scenes: [{ title: 'Чай', prompt: 'tea scene' }],
        }),
      ),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    const analysis = await driver.analyzeGarment(input);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.example.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('google/gemini-2.5-flash');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('BASE STYLE CONCEPT');
    // системный промпт требует искать брендовые артефакты
    expect(body.messages[0].content).toContain('BRAND ARTIFACTS');
    const userContent = body.messages[1].content;
    expect(userContent[1].type).toBe('image_url');
    expect(userContent[1].image_url.url).toContain('data:image/webp;base64,');

    expect(analysis.garmentType).toBe('Пижама');
    expect(analysis.brandArtifacts).toContain('логотип на груди');
    expect(analysis.scenes[0].prompt).toBe('tea scene');
  });

  it('понимает JSON в markdown-заборе от модели', async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse(
        '```json\n{"garmentType":"Халат","color":"бежевый","styleMood":"","modelNote":"","notes":"","scenes":[{"title":"Утро","prompt":"morning scene"}]}\n```',
      ),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    const analysis = await driver.analyzeGarment(input);
    expect(analysis.garmentType).toBe('Халат');
    expect(analysis.scenes).toHaveLength(1);
  });

  it('сцены отсутствуют → понятная ошибка вместо пустого анализа', async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse(JSON.stringify({ garmentType: 'Пижама', scenes: [] })),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    await expect(driver.analyzeGarment(input)).rejects.toThrow(
      'не удалось разобрать JSON-анализ',
    );
  });

  it('ошибка провайдера с HTTP 200 (конверт OpenRouter) → Error с описанием', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: 'quota exceeded' } }),
        { status: 200 },
      ),
    );

    const driver = new RouterAiImageDriver(makeConfig());
    await expect(driver.analyzeGarment(input)).rejects.toThrow(
      'RouterAI API /chat/completions → 200: quota exceeded',
    );
  });
});
