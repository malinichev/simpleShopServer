-- ============================================================
-- Скрипт создания 3 категорий + 9 товаров (10 строк) + 50 вариантов
-- Запускать ПОСЛЕ truncate и ПОСЛЕ загрузки фото в S3
-- ============================================================

-- Заменяемые URL-префиксы (подставить актуальные после загрузки):
-- LOCAL_S3 = 'http://localhost:9000/sports-shop'
-- PROD_S3  = 'https://s3-952264.s3.spb.sprinthost.ru'

-- ============================================================
-- 1. Категории
-- ============================================================
INSERT INTO categories (id, name, slug, description, "order", "isActive", "createdAt", "updatedAt")
VALUES
  ('c0010001-0001-4000-a000-000000000001', 'Спортивные топы', 'tops', 'Спортивные топы и майки для тренировок', 1, true, NOW(), NOW()),
  ('c0010001-0001-4000-a000-000000000002', 'Леггинсы',        'leggings', 'Леггинсы для фитнеса и йоги',          2, true, NOW(), NOW()),
  ('c0010001-0001-4000-a000-000000000003', 'Костюмы',          'sets',     'Спортивные костюмы и комплекты',         3, true, NOW(), NOW());

-- ============================================================
-- 2. Товары
-- Каждый товар: id, categoryId, name, slug, description, shortDescription, sku, price, compareAtPrice, color, colorHex, modelId, images JSONB, attributes JSONB, seo JSONB, status, isVisible
-- ============================================================

-- Товар #1: Кроп-топ Form, чёрный
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000001',
  'c0010001-0001-4000-a000-000000000001',
  'Кроп-топ с длинным рукавом Form',
  'top-form',
  'Элегантный кроп-топ с длинным рукавом из матового компрессионного трикотажа. Подчёркивает силуэт, обеспечивает поддержку и свободу движений. Идеален для йоги, пилатеса и силовых тренировок.',
  'Кроп-топ с длинным рукавом из компрессионного трикотажа',
  'TOP-FORM-BLK',
  2900,
  'чёрный',
  '#000000',
  '[
    {"id":"top-form-black-1","url":"{S3_BASE}/products/top-form/black-1.webp","alt":"Кроп-топ Form чёрный, вид спереди","order":0},
    {"id":"top-form-black-2","url":"{S3_BASE}/products/top-form/black-2.webp","alt":"Кроп-топ Form чёрный, вид сбоку","order":1},
    {"id":"top-form-black-3","url":"{S3_BASE}/products/top-form/black-3.webp","alt":"Кроп-топ Form чёрный, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"78% нейлон, 22% спандекс","activity":["yoga","pilates","gym"],"features":["Длинный рукав","Компрессионная посадка","Влагоотводящая ткань"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Кроп-топ с длинным рукавом Form — купить","description":"Кроп-топ с длинным рукавом Form из компрессионного трикотажа. Идеален для йоги, пилатеса и силовых тренировок. Доставка по России.","keywords":["кроп-топ","длинный рукав","спортивный топ","для йоги","компрессионный"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #2: Майка Flow, белый
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000002',
  'c0010001-0001-4000-a000-000000000001',
  'Майка с открытой спиной Flow',
  'top-flow',
  'Невесомая майка с открытой спиной из струящейся ткани. Эффектный вырез сзади создаёт соблазнительный силуэт. Минималистичный дизайн для максимальной свободы движений.',
  'Майка с открытой спиной из лёгкой струящейся ткани',
  'TOP-FLOW-WHT',
  2300,
  'белый',
  '#FFFFFF',
  '[
    {"id":"top-flow-white-1","url":"{S3_BASE}/products/top-flow/white-1.webp","alt":"Майка Flow белая, вид спереди","order":0},
    {"id":"top-flow-white-2","url":"{S3_BASE}/products/top-flow/white-2.webp","alt":"Майка Flow белая, вид сбоку","order":1},
    {"id":"top-flow-white-3","url":"{S3_BASE}/products/top-flow/white-3.webp","alt":"Майка Flow белая, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"92% полиэстер, 8% эластан","activity":["yoga","pilates","running"],"features":["Открытая спина","Влагоотводящая","Ультралёгкая"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Майка с открытой спиной Flow — купить","description":"Майка с открытой спиной Flow из струящейся ткани. Соблазнительный вырез, свобода движений. Доставка по России.","keywords":["майка","открытая спина","спортивная майка","для йоги","лёгкая"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #3: Топ Sculpt, розовый (compareAtPrice=3200)
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, "compareAtPrice", color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000003',
  'c0010001-0001-4000-a000-000000000001',
  'Топ с V-образным вырезом Sculpt',
  'top-sculpt',
  'Облегающий топ с глубоким V-образным вырезом. Подчёркивает линию декольте и талию. Мягкий трикотаж с эффектом push-up. Создан для тех, кто любит внимание.',
  'Топ с V-вырезом из мягкого трикотажа с эффектом push-up',
  'TOP-SCLP-PNK',
  2600,
  3200,
  'розовый',
  '#FFC0CB',
  '[
    {"id":"top-sculpt-pink-1","url":"{S3_BASE}/products/top-sculpt/pink-1.webp","alt":"Топ Sculpt розовый, вид спереди","order":0},
    {"id":"top-sculpt-pink-2","url":"{S3_BASE}/products/top-sculpt/pink-2.webp","alt":"Топ Sculpt розовый, вид сбоку","order":1},
    {"id":"top-sculpt-pink-3","url":"{S3_BASE}/products/top-sculpt/pink-3.webp","alt":"Топ Sculpt розовый, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"85% полиамид, 15% эластан","activity":["gym","fitness","yoga"],"features":["V-образный вырез","Push-up эффект","Мягкий трикотаж"],"careInstructions":"Ручная стирка при 30°C"}'::jsonb,
  '{"title":"Топ с V-образным вырезом Sculpt — купить","description":"Топ с V-вырезом Sculpt из мягкого трикотажа. Эффект push-up, подчёркивает силуэт. Доставка по России.","keywords":["топ","V-вырез","спортивный топ","розовый","для фитнеса"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #4: Леггинсы Shaping, чёрный (modelId общий с серым)
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, color, "colorHex", "modelId", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000004',
  'c0010001-0001-4000-a000-000000000002',
  'Леггинсы с контурной строчкой Shaping',
  'leggings-shaping',
  'Леггинсы с анатомической контурной строчкой, визуально удлиняющей ноги и подчёркивающей ягодицы. Высокая посадка, компрессионный трикотаж, плоские швы. Эффект «вторая кожа».',
  'Леггинсы с контурной строчкой, высокая посадка, компрессия',
  'LEG-SHP-BLK',
  4800,
  'чёрный',
  '#000000',
  'a0010001-0001-4000-a000-000000000100',
  '[
    {"id":"leggings-shaping-black-1","url":"{S3_BASE}/products/leggings-shaping/black-1.webp","alt":"Леггинсы Shaping чёрные, вид спереди","order":0},
    {"id":"leggings-shaping-black-2","url":"{S3_BASE}/products/leggings-shaping/black-2.webp","alt":"Леггинсы Shaping чёрные, вид сбоку","order":1},
    {"id":"leggings-shaping-black-3","url":"{S3_BASE}/products/leggings-shaping/black-3.webp","alt":"Леггинсы Shaping чёрные, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"75% нейлон, 25% спандекс","activity":["gym","fitness","yoga"],"features":["Высокая посадка","Контурная строчка","Компрессия","Плоские швы"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Леггинсы с контурной строчкой Shaping — купить","description":"Леггинсы Shaping с анатомической контурной строчкой. Высокая посадка, компрессия. Доставка по России.","keywords":["леггинсы","контурная строчка","компрессионные","высокая посадка","для зала"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #4b: Леггинсы Shaping, серый (modelId общий с чёрным)
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, color, "colorHex", "modelId", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000005',
  'c0010001-0001-4000-a000-000000000002',
  'Леггинсы с контурной строчкой Shaping',
  'leggings-shaping-grey',
  'Леггинсы с анатомической контурной строчкой, визуально удлиняющей ноги и подчёркивающей ягодицы. Высокая посадка, компрессионный трикотаж, плоские швы. Эффект «вторая кожа».',
  'Леггинсы с контурной строчкой, высокая посадка, компрессия',
  'LEG-SHP-GRY',
  4800,
  'серый',
  '#808080',
  'a0010001-0001-4000-a000-000000000100',
  '[
    {"id":"leggings-shaping-grey-1","url":"{S3_BASE}/products/leggings-shaping/grey-1.webp","alt":"Леггинсы Shaping серые, вид спереди","order":0},
    {"id":"leggings-shaping-grey-2","url":"{S3_BASE}/products/leggings-shaping/grey-2.webp","alt":"Леггинсы Shaping серые, вид сбоку","order":1},
    {"id":"leggings-shaping-grey-3","url":"{S3_BASE}/products/leggings-shaping/grey-3.webp","alt":"Леггинсы Shaping серые, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"75% нейлон, 25% спандекс","activity":["gym","fitness","yoga"],"features":["Высокая посадка","Контурная строчка","Компрессия","Плоские швы"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Леггинсы с контурной строчкой Shaping серые — купить","description":"Леггинсы Shaping серые с анатомической контурной строчкой. Высокая посадка, компрессия. Доставка.","keywords":["леггинсы","контурная строчка","серые","высокая посадка","для зала"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #5: Леггинсы Mesh, чёрный (compareAtPrice=5200)
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, "compareAtPrice", color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000006',
  'c0010001-0001-4000-a000-000000000002',
  'Леггинсы 7/8 с сетчатыми вставками Mesh',
  'leggings-mesh',
  'Укороченные леггинсы 7/8 с прозрачными сетчатыми вставками на икрах. Сочетают компрессию, вентиляцию и дерзкий дизайн. Для тех, кто не боится выделяться.',
  'Леггинсы 7/8 с сетчатыми вставками, компрессия, вентиляция',
  'LEG-MSH-BLK',
  4200,
  5200,
  'чёрный',
  '#000000',
  '[
    {"id":"leggings-mesh-black-1","url":"{S3_BASE}/products/leggings-mesh/black-1.webp","alt":"Леггинсы Mesh чёрные, вид спереди","order":0},
    {"id":"leggings-mesh-black-2","url":"{S3_BASE}/products/leggings-mesh/black-2.webp","alt":"Леггинсы Mesh чёрные, вид сбоку","order":1},
    {"id":"leggings-mesh-black-3","url":"{S3_BASE}/products/leggings-mesh/black-3.webp","alt":"Леггинсы Mesh чёрные, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"78% полиамид, 22% эластан","activity":["gym","running","fitness"],"features":["Длина 7/8","Сетчатые вставки","Компрессия","Вентиляция"],"careInstructions":"Машинная стирка при 30°C, без отбеливателя"}'::jsonb,
  '{"title":"Леггинсы 7/8 Mesh с сетчатыми вставками — купить","description":"Укороченные леггинсы Mesh с сетчатыми вставками. Компрессия, вентиляция, дерзкий дизайн. Доставка по России.","keywords":["леггинсы","7/8","сетка","mesh","для бега"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #6: Леггинсы ThermalFlex, синий
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000007',
  'c0010001-0001-4000-a000-000000000002',
  'Утеплённые леггинсы ThermalFlex',
  'leggings-thermal',
  'Утеплённые леггинсы с мягким флисовым слоем для тренировок и пробежек в холодную погоду. Сохраняют тепло, отводят влагу, не сковывают движений. Ваш must-have на осень и зиму.',
  'Утеплённые леггинсы с флисом для холодной погоды',
  'LEG-THM-BLU',
  5200,
  'синий',
  '#4169E1',
  '[
    {"id":"leggings-thermal-blue-1","url":"{S3_BASE}/products/leggings-thermal/blue-1.webp","alt":"Леггинсы ThermalFlex синие, вид спереди","order":0},
    {"id":"leggings-thermal-blue-2","url":"{S3_BASE}/products/leggings-thermal/blue-2.webp","alt":"Леггинсы ThermalFlex синие, вид сбоку","order":1},
    {"id":"leggings-thermal-blue-3","url":"{S3_BASE}/products/leggings-thermal/blue-3.webp","alt":"Леггинсы ThermalFlex синие, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"88% полиэстер, 12% спандекс (флисовая подкладка)","activity":["running","outdoor","fitness"],"features":["Флисовая подкладка","Терморегуляция","Влагоотвод","Высокая посадка"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Утеплённые леггинсы ThermalFlex — купить","description":"Утеплённые леггинсы ThermalFlex с флисом. Тепло, комфорт, свобода движений. Доставка по России.","keywords":["утеплённые леггинсы","флис","зимние","для бега","термо"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #7: Костюм Unity, бирюзовый (compareAtPrice=8200)
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, "compareAtPrice", color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000008',
  'c0010001-0001-4000-a000-000000000003',
  'Комплект с бра и леггинсами Unity',
  'set-unity',
  'Гармоничный комплект из спортивного бра с рейсербеком и леггинсов с анатомической посадкой. Создан для йоги, растяжки и медитативных практик. Единый цвет, единый стиль, полная свобода.',
  'Комплект: бра с рейсербеком + леггинсы, единый стиль',
  'SET-UNT-TRQ',
  6800,
  8200,
  'бирюзовый',
  '#40E0D0',
  '[
    {"id":"set-unity-turquoise-1","url":"{S3_BASE}/products/set-unity/turquoise-1.webp","alt":"Костюм Unity бирюзовый, вид спереди","order":0},
    {"id":"set-unity-turquoise-2","url":"{S3_BASE}/products/set-unity/turquoise-2.webp","alt":"Костюм Unity бирюзовый, вид сбоку","order":1},
    {"id":"set-unity-turquoise-3","url":"{S3_BASE}/products/set-unity/turquoise-3.webp","alt":"Костюм Unity бирюзовый, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"80% нейлон, 20% спандекс","activity":["yoga","pilates","stretching"],"features":["Рейсербек","Анатомическая посадка","Комплект","Влагоотвод"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Комплект Unity бра + леггинсы — купить","description":"Спортивный комплект Unity: бра с рейсербеком и леггинсы. Для йоги и растяжки. Доставка по России.","keywords":["комплект","бра","леггинсы","для йоги","бирюзовый"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #8: Костюм SummerSet, белый
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000009',
  'c0010001-0001-4000-a000-000000000003',
  'Комплект с кроп-топом и шортами SummerSet',
  'set-summerset',
  'Лёгкий летний комплект из кроп-топа и свободных шорт. Дышащая ткань, минималистичный крой, универсальный белый цвет. Для жарких тренировок и городских прогулок.',
  'Летний комплект: кроп-топ + свободные шорты',
  'SET-SMR-WHT',
  5900,
  'белый',
  '#FFFFFF',
  '[
    {"id":"set-summerset-white-1","url":"{S3_BASE}/products/set-summerset/white-1.webp","alt":"Костюм SummerSet белый, вид спереди","order":0},
    {"id":"set-summerset-white-2","url":"{S3_BASE}/products/set-summerset/white-2.webp","alt":"Костюм SummerSet белый, вид сбоку","order":1},
    {"id":"set-summerset-white-3","url":"{S3_BASE}/products/set-summerset/white-3.webp","alt":"Костюм SummerSet белый, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"95% хлопок, 5% эластан","activity":["fitness","outdoor","casual"],"features":["Дышащая ткань","Кроп-топ","Свободные шорты","Летний комплект"],"careInstructions":"Машинная стирка при 30°C"}'::jsonb,
  '{"title":"Комплект SummerSet кроп-топ и шорты — купить","description":"Летний комплект SummerSet: кроп-топ и шорты. Дышащая ткань, белый цвет. Доставка по России.","keywords":["комплект","кроп-топ","шорты","летний","белый"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- Товар #9: Костюм Layered Pro, чёрный (compareAtPrice=9200)
INSERT INTO products (id, "categoryId", name, slug, description, "shortDescription", sku, price, "compareAtPrice", color, "colorHex", images, attributes, seo, status, "isVisible", "createdAt", "updatedAt")
VALUES (
  'a0010001-0001-4000-a000-000000000010',
  'c0010001-0001-4000-a000-000000000003',
  'Трёхслойный комплект Layered Pro',
  'set-layered',
  'Профессиональный трёхслойный комплект: куртка на молнии, спортивный бра и леггинсы. Можно носить вместе или по отдельности. Универсальный чёрный цвет, премиальные материалы.',
  'Трёхслойный комплект: куртка + бра + леггинсы',
  'SET-LYR-BLK',
  7500,
  9200,
  'чёрный',
  '#000000',
  '[
    {"id":"set-layered-black-1","url":"{S3_BASE}/products/set-layered/black-1.webp","alt":"Костюм Layered Pro чёрный, вид спереди","order":0},
    {"id":"set-layered-black-2","url":"{S3_BASE}/products/set-layered/black-2.webp","alt":"Костюм Layered Pro чёрный, вид сбоку","order":1},
    {"id":"set-layered-black-3","url":"{S3_BASE}/products/set-layered/black-3.webp","alt":"Костюм Layered Pro чёрный, вид сзади","order":2}
  ]'::jsonb,
  '{"material":"Куртка: 100% полиэстер; Бра: 78% нейлон, 22% спандекс; Леггинсы: 75% нейлон, 25% спандекс","activity":["gym","fitness","outdoor"],"features":["Три предмета","Куртка на молнии","Универсальный","Премиум"],"careInstructions":"Машинная стирка при 30°C, куртку стирать отдельно"}'::jsonb,
  '{"title":"Трёхслойный комплект Layered Pro — купить","description":"Комплект Layered Pro: куртка, бра и леггинсы. Три предмета, премиум качество. Доставка по России.","keywords":["комплект","трёхслойный","куртка","леггинсы","чёрный"]}'::jsonb,
  'active', true, NOW(), NOW()
);

-- ============================================================
-- 3. Варианты (размеры) — по 5 на каждый продукт, stock=10
-- ============================================================
-- Генерируем функцию для вставки вариантов
DO $$
DECLARE
  product_id UUID;
  sizes TEXT[] := ARRAY['XS','S','M','L','XL'];
  size_text TEXT;
  base_sku TEXT;
  base_price NUMERIC;
  variant_sku TEXT;
BEGIN
  FOR product_id, base_sku, base_price IN
    SELECT id, sku, price FROM products ORDER BY id
  LOOP
    FOREACH size_text IN ARRAY sizes LOOP
      variant_sku := base_sku || '-' || size_text;
      INSERT INTO product_variants (id, "productId", size, sku, stock, price, "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        product_id,
        size_text,
        variant_sku,
        10,
        base_price,
        NOW(),
        NOW()
      );
    END LOOP;
  END LOOP;
END $$;
