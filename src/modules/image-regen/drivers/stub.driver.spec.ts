import { StubImageDriver } from './stub.driver';

describe('StubImageDriver.editImage', () => {
  it('возвращает валидный PNG для каждого запрошенного варианта', async () => {
    const driver = new StubImageDriver();
    const results = await driver.editImage({
      image: Buffer.from('source'),
      mimeType: 'image/webp',
      prompt: 'Чай перед сном & cozy <mood>',
      n: 2,
    });

    expect(results).toHaveLength(2);
    for (const { buffer } of results) {
      // PNG-магия
      expect(buffer[0]).toBe(0x89);
      expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
    }
  });

  it('разные промпты дают разные картинки (хэш в цвет градиента)', async () => {
    const driver = new StubImageDriver();
    const [a] = await driver.editImage({
      image: Buffer.from('x'),
      mimeType: 'image/png',
      prompt: 'first prompt',
      n: 1,
    });
    const [b] = await driver.editImage({
      image: Buffer.from('x'),
      mimeType: 'image/png',
      prompt: 'совершенно другая сцена',
      n: 1,
    });
    expect(a.buffer.equals(b.buffer)).toBe(false);
  });
});

describe('StubImageDriver.analyzeGarment', () => {
  it('возвращает детерминированный анализ с двумя сценами', async () => {
    const driver = new StubImageDriver();
    const analysis = await driver.analyzeGarment({
      images: [{ buffer: Buffer.from('x'), mimeType: 'image/png' }],
      concept: 'BASE',
    });
    expect(analysis.scenes.length).toBeGreaterThanOrEqual(2);
    expect(analysis.garmentType).toContain('stub');
    expect(analysis.scenes[0].prompt).toBeTruthy();
  });
});
