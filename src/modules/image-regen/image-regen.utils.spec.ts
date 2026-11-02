import {
  assertFetchableUrl,
  sniffMimeType,
} from './image-regen.utils';

describe('assertFetchableUrl — SSRF-защита серверной загрузки фото', () => {
  const savedEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  it('пропускает http/https на публичных хостах', () => {
    expect(() => assertFetchableUrl('https://s3.spb.sprinthost.ru/s3-952264/x.webp')).not.toThrow();
    expect(() => assertFetchableUrl('http://goods-photos.static1-sima-land.com/1.jpg')).not.toThrow();
  });

  it('отвергает не-http(s) схемы', () => {
    expect(() => assertFetchableUrl('ftp://example.com/x.webp')).toThrow('http/https');
    expect(() => assertFetchableUrl('file:///etc/passwd')).toThrow('http/https');
  });

  it('отвергает мусорный URL', () => {
    expect(() => assertFetchableUrl('не-url')).toThrow('Некорректный URL');
  });

  it('в dev пропускает localhost/приватные (локальный стек: фото :3002, S3 :9000, мок :4011)', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertFetchableUrl('http://localhost:3002/product-photos/1.webp')).not.toThrow();
    expect(() => assertFetchableUrl('http://127.0.0.1:9000/sports-shop/x.webp')).not.toThrow();
    expect(() => assertFetchableUrl('http://192.168.1.50/x.webp')).not.toThrow();
  });

  it('в проде запрещает loopback/приватные/зарезервированные хосты', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertFetchableUrl('http://localhost:3002/x.webp')).toThrow('loopback');
    expect(() => assertFetchableUrl('http://127.0.0.1/x.webp')).toThrow('loopback');
    expect(() => assertFetchableUrl('http://10.0.0.5/x.webp')).toThrow('loopback');
    expect(() => assertFetchableUrl('http://192.168.0.10/x.webp')).toThrow('loopback');
    expect(() => assertFetchableUrl('http://172.16.5.5/x.webp')).toThrow('loopback');
    expect(() => assertFetchableUrl('http://169.254.169.254/latest/meta-data')).toThrow('loopback');
    expect(() => assertFetchableUrl('http://[::1]/x.webp')).toThrow('loopback');
    // публичные — по-прежнему можно
    expect(() => assertFetchableUrl('https://s3.spb.sprinthost.ru/s3-952264/x.webp')).not.toThrow();
  });
});

describe('sniffMimeType', () => {
  it('PNG/JPEG/WebP по магическим байтам, остальное — png', () => {
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('image/png');
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffMimeType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('image/webp');
    expect(sniffMimeType(Buffer.from([1, 2, 3, 4]))).toBe('image/png');
  });
});
