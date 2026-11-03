import {
  computeTargetStock,
  parseSimaSid,
  assertFetchableApiUrl,
} from './stock-sync.utils';

describe('stock-sync.utils', () => {
  describe('parseSimaSid', () => {
    it('SL-{sid} → числовой sid', () => {
      expect(parseSimaSid('SL-9945492')).toBe(9945492);
      expect(parseSimaSid('sl-123')).toBe(123);
      expect(parseSimaSid(' SL-42 ')).toBe(42);
    });

    it('чужие SKU → null (синк не трогает)', () => {
      expect(parseSimaSid('WB-123456')).toBeNull();
      expect(parseSimaSid('SL-abc')).toBeNull();
      expect(parseSimaSid('SL-')).toBeNull();
      expect(parseSimaSid('SL-12-34')).toBeNull();
      expect(parseSimaSid('')).toBeNull();
    });
  });

  describe('computeTargetStock', () => {
    it('обычный случай: min(balance, 999) − продажи', () => {
      expect(
        computeTargetStock({ balance: 40, minQty: 1, disabled: false }, 0),
      ).toBe(40);
      expect(
        computeTargetStock({ balance: 40, minQty: 1, disabled: false }, 3),
      ).toBe(37);
    });

    it('кап 999 как при сборке каталога', () => {
      expect(
        computeTargetStock({ balance: 5000, minQty: 1, disabled: false }, 0),
      ).toBe(999);
    });

    it('вычет продаж не уходит ниже нуля', () => {
      expect(
        computeTargetStock({ balance: 2, minQty: 1, disabled: false }, 5),
      ).toBe(0);
    });

    it('товар снят с продажи → 0', () => {
      expect(
        computeTargetStock({ balance: 100, minQty: 1, disabled: true }, 0),
      ).toBe(0);
    });

    it('balance < min_qty → купить нельзя → 0', () => {
      expect(
        computeTargetStock({ balance: 2, minQty: 3, disabled: false }, 0),
      ).toBe(0);
      // min_qty <= 0 трактуем как 1 (защита от деления на «минимум 0»)
      expect(
        computeTargetStock({ balance: 0, minQty: 0, disabled: false }, 0),
      ).toBe(0);
      expect(
        computeTargetStock({ balance: 1, minQty: 0, disabled: false }, 0),
      ).toBe(1);
    });
  });

  describe('assertFetchableApiUrl', () => {
    const prevNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = prevNodeEnv;
    });

    it('публичные http/https проходят', () => {
      expect(() =>
        assertFetchableApiUrl('https://www.sima-land.ru/api/v3/'),
      ).not.toThrow();
      expect(() =>
        assertFetchableApiUrl('http://example.com/api'),
      ).not.toThrow();
    });

    it('не-HTTP схемы запрещены', () => {
      expect(() => assertFetchableApiUrl('file:///etc/passwd')).toThrow(
        'http/https',
      );
      expect(() => assertFetchableApiUrl('ftp://example.com')).toThrow(
        'http/https',
      );
      expect(() => assertFetchableApiUrl('not a url')).toThrow('Некорректный');
    });

    it('в проде loopback/приватные хосты запрещены, в dev — разрешены (e2e-мок)', () => {
      process.env.NODE_ENV = 'production';
      expect(() =>
        assertFetchableApiUrl('http://localhost:4012/api/v3/'),
      ).toThrow('loopback');
      expect(() =>
        assertFetchableApiUrl('http://127.0.0.1:4012/api/v3/'),
      ).toThrow('loopback');
      expect(() => assertFetchableApiUrl('http://10.0.0.5/api/v3/')).toThrow(
        'loopback',
      );
      expect(() =>
        assertFetchableApiUrl('http://192.168.1.10/api/v3/'),
      ).toThrow('loopback');

      process.env.NODE_ENV = 'development';
      expect(() =>
        assertFetchableApiUrl('http://localhost:4012/api/v3/'),
      ).not.toThrow();
    });
  });
});
