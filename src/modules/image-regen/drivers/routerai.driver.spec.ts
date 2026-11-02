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
        'ai.imageSize': '1024x1536',
        'ai.timeoutMs': '5000',
        ...overrides,
      })[key],
  } as unknown as ConfigService;
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
