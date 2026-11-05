import { parseSimaExport } from './sima-export.parser';

// Структура реальной выгрузки пользователя (2026-11-05, «Модификации» вкл.):
// ;-разделитель, BOM, кавычки с "" внутри, мультистрочная ячейка «Модификации».
const CSV = [
  '\uFEFF"Категория 2";"Категория 4";Артикул;Заголовок;Цена;"Крупный опт";Остаток;Описание;Изображения;Производитель;Цвет;Состав;Ткань;Штрихкод;"Модификации: Параметры";"Модификации: Цены";"Модификации: Наличие";"Модификации: Остатки";"Модификации: Артикулы";Модификации;Размер',
  '"Женская одежда";"Пижамы и комплекты";5354799;"Пижама женская: свитшот, шорты, MINAKU: New happy, размер 52, белая";1440;1107;56;"Мягкая домашняя коллекция. Состав: полиэстер.";"https://goods-photos.static1-sima-land.com/items/4640017/0/700-nw.jpg;https://goods-photos.static1-sima-land.com/items/4640017/1/700-nw.jpg";MINAKU;Белый;"Полиэстер 100%";Капитон;"2900053547997;4650338499197";"52;48;50;54";"1440;1440;1440;1440";"Да;Да;Да;Да";"21; 8; 10; 17";"5354799;5354797;5354798;5354800";"Размер:""52""|Цена:""1440""|Артикул:""5354799""|Наличие:""В наличии,21""\nРазмер:""48""|Цена:""1440""|Артикул:""5354797""|Наличие:""В наличии,8""";"48;50;52;54"',
  '"Мужская одежда";"Пижамы и комплекты";10553639;"Пижама мужская KAFTAN";3353;2579;3;"";"https://goods-photos.static1-sima-land.com/items/8120604/0/700-nw.jpg";KAFTAN;Серый;"Хлопок 100%";Фланель;;"48;50;52;54;56";"3353;3353;3353;3353;3353";"Да;Да;Да;Нет;Да";"5;4;3;0;2";"10553639;10553638;10553637;10553636;10553635";;"48;50;52;54;56"',
  '"Женская одежда";"Халаты";7487050;"Халат MINAKU Home collection, серый";2000;1500;;"Тёплый халат";"https://goods-photos.static1-sima-land.com/items/6367252/0/700-nw.jpg";MINAKU;;"";"";;;;;;;;"44;46;48"',
].join('\r\n');

describe('parseSimaExport', () => {
  const result = parseSimaExport(Buffer.from(CSV, 'utf8'));

  it('парсит все строки с артикулом', () => {
    expect(result.rows).toHaveLength(3);
    expect(result.skippedNoSid).toBe(0);
  });

  it('женская пижама: модификации выровненными списками', () => {
    const row = result.rows[0];
    expect(row.sid).toBe(5354799);
    expect(row.genderCategory).toBe('Женская одежда');
    expect(row.color).toBe('Белый');
    expect(row.retailPrice).toBe(1440);
    expect(row.wholesalePrice).toBe(1107);
    expect(row.stock).toBe(56);
    expect(row.barcode).toBe('2900053547997');
    expect(row.images).toHaveLength(2);
    expect(row.sizes).toEqual([
      { size: '52', sid: 5354799, price: 1440, stock: 21 },
      { size: '48', sid: 5354797, price: 1440, stock: 8 },
      { size: '50', sid: 5354798, price: 1440, stock: 10 },
      { size: '54', sid: 5354800, price: 1440, stock: 17 },
    ]);
  });

  it('модификация «Нет» → остаток 0', () => {
    const men = result.rows[1];
    expect(men.genderCategory).toBe('Мужская одежда');
    const disabled = men.sizes.find((s) => s.size === '54');
    expect(disabled?.stock).toBe(0);
    expect(men.sizes).toHaveLength(5);
  });

  it('fallback без модификаций: размеры из «Размер», остаток из Остаток', () => {
    const robe = result.rows[2];
    expect(robe.sizes.map((s) => s.size)).toEqual(['44', '46', '48']);
    expect(robe.sizes.every((s) => s.sid === undefined)).toBe(true);
    expect(robe.stock).toBe(0);
  });

  it('не выгрузка Сималенда → понятная ошибка', () => {
    expect(() =>
      parseSimaExport(Buffer.from('a;b;c\n1;2;3', 'utf8')),
    ).toThrow(/не похоже на выгрузку Сималенда/);
  });
});
