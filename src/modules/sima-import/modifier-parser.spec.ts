import { parseModifiers } from './modifier-parser';

// Реальные формы блока modifier-elements со страниц Сималенда
// (собраны 2026-11-05, docs/research/sima-sync-2026-11-03/sima_pages/)

const ESCAPED_PAGE = `
<script>
window.__STATE__ = "{\\"modifier-elements\\":{\\"data\\":[{\\"title\\":\\"Варианты\\",\\"items\\":[{\\"productId\\":4640018,\\"itemSid\\":5354800,\\"name\\":\\"Белый\\",\\"href\\":\\"/5354800/x/\\"},{\\"itemSid\\":5354807,\\"name\\":\\"Красный\\",\\"selected\\":true}]},{\\"title\\":\\"Размер\\",\\"items\\":[{\\"itemSid\\":5354803,\\"name\\":\\"46\\"},{\\"itemSid\\":5354804,\\"name\\":\\"48\\"},{\\"itemSid\\":5354807,\\"name\\":\\"54\\"}]}]}}";
</script>`;

const RAW_PAGE = `
<div>товар</div>
<script type="application/ld+json">{"modifier-elements":{"data":[{"title":"Варианты","items":[{"itemSid":7310908,"name":"Бежевый"},{"itemSid":7310902,"name":"Персиковый"},{"itemSid":7487050,"name":"Серый","selected":true}]},{"title":"Размер","items":[{"itemSid":7487051,"name":"44"},{"itemSid":7487054,"name":"50"}]}]}}</script>`;

describe('parseModifiers', () => {
  it('экранированная форма (\\uXXXX + \\")', () => {
    const mods = parseModifiers(ESCAPED_PAGE);
    expect(mods.colors).toEqual([
      { sid: 5354800, name: 'Белый' },
      { sid: 5354807, name: 'Красный' },
    ]);
    expect(mods.sizes.map((s) => s.sid)).toEqual([5354803, 5354804, 5354807]);
  });

  it('сырая JSON-форма', () => {
    const mods = parseModifiers(RAW_PAGE);
    expect(mods.colors.map((c) => c.name)).toEqual([
      'Бежевый',
      'Персиковый',
      'Серый',
    ]);
    expect(mods.sizes).toEqual([
      { sid: 7487051, name: '44' },
      { sid: 7487054, name: '50' },
    ]);
  });

  it('без вариантов — пустой результат (data:null)', () => {
    const mods = parseModifiers(
      '{"modifier-elements":{"data":null,"totalModifiersCount":0}}',
    );
    expect(mods.colors).toEqual([]);
    expect(mods.sizes).toEqual([]);
  });
});
