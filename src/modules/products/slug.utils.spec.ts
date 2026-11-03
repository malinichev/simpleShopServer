import { translitRuToLat, makeSlug } from './slug.utils';

describe('slug.utils — транслитерация и slug', () => {
  it('кириллица → латиница по карте', () => {
    expect(translitRuToLat('Комбинезон розовый')).toBe('kombinezon rozovyy');
    expect(translitRuToLat('Пижама')).toBe('pizhama');
    expect(translitRuToLat('Халат lux')).toBe('halat lux');
  });

  it('makeSlug: только [a-z0-9-], пробелы и скобки → дефис, без дублей и краёв', () => {
    expect(makeSlug('Комбинезон FlexOne (розовый)')).toBe('kombinezon-flexone-rozovyy');
    expect(makeSlug('  Пижама  с  принтом!! ')).toBe('pizhama-s-printom');
    expect(makeSlug('!!!')).toBe('');
    expect(makeSlug('Sima-land / доставка')).toBe('sima-land-dostavka');
  });

  it('латиница проходит без изменений (совместимо с англ. названиями)', () => {
    expect(makeSlug('Jumpsuit FlexOne Pink')).toBe('jumpsuit-flexone-pink');
  });
});
