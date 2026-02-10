import { DataSource } from 'typeorm';
import { Product, ProductStatus, ProductVariant } from '@/modules/products/entities/product.entity';
import { Category } from '@/modules/categories/entities/category.entity';
import { v4 as uuid } from 'uuid';

const colors = [
  { name: 'черный', hex: '#000000' },
  { name: 'белый', hex: '#FFFFFF' },
  { name: 'серый', hex: '#808080' },
  { name: 'розовый', hex: '#FFC0CB' },
  { name: 'синий', hex: '#0000FF' },
  { name: 'бирюзовый', hex: '#40E0D0' },
];

const sizes = ['XS', 'S', 'M', 'L', 'XL'];

function randomStock(): number {
  return Math.floor(Math.random() * 51);
}

function pickColors(count: number) {
  const shuffled = [...colors].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateVariants(colorCount: number, baseSku: string, basePrice: number): ProductVariant[] {
  const selectedColors = pickColors(colorCount);
  const variants: ProductVariant[] = [];

  for (const color of selectedColors) {
    for (const size of sizes) {
      variants.push({
        id: uuid(),
        size,
        color: color.name,
        colorHex: color.hex,
        sku: `${baseSku}-${color.name.slice(0, 3).toUpperCase()}-${size}`,
        stock: randomStock(),
        price: basePrice,
      });
    }
  }

  return variants;
}

interface ProductData {
  categorySlug: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  tags: string[];
  activity: string[];
  material: string;
  features: string[];
  colorCount: number;
}

const productsData: ProductData[] = [
  // Леггинсы (3)
  {
    categorySlug: 'leggings',
    name: 'Леггинсы высокой посадки Flex',
    slug: 'leggings-flex-high-waist',
    description: 'Леггинсы с высокой посадкой из компрессионной ткани. Идеально облегают фигуру, обеспечивая поддержку во время интенсивных тренировок. Плоские швы не натирают кожу.',
    shortDescription: 'Компрессионные леггинсы с высокой посадкой',
    sku: 'LG-FLEX-01',
    price: 4500,
    compareAtPrice: 5500,
    tags: ['бестселлер', 'новинка'],
    activity: ['gym', 'yoga'],
    material: '78% нейлон, 22% спандекс',
    features: ['Высокая посадка', 'Компрессия', 'Влагоотведение', 'Плоские швы'],
    colorCount: 4,
  },
  {
    categorySlug: 'leggings',
    name: 'Леггинсы для бега AeroRun',
    slug: 'leggings-aerorun',
    description: 'Лёгкие леггинсы для бега с боковым карманом для телефона. Светоотражающие элементы для безопасного бега в тёмное время суток.',
    shortDescription: 'Беговые леггинсы с карманом для телефона',
    sku: 'LG-AERO-01',
    price: 5200,
    tags: ['бег', 'светоотражение'],
    activity: ['running'],
    material: '85% полиэстер, 15% эластан',
    features: ['Карман для телефона', 'Светоотражатели', 'Быстрое высыхание'],
    colorCount: 3,
  },
  {
    categorySlug: 'leggings',
    name: 'Леггинсы бесшовные Comfort',
    slug: 'leggings-comfort-seamless',
    description: 'Бесшовные леггинсы с эффектом второй кожи. Мягкая ткань обеспечивает максимальный комфорт при любых тренировках.',
    shortDescription: 'Бесшовные леггинсы для комфортных тренировок',
    sku: 'LG-CMFT-01',
    price: 3800,
    tags: ['бесшовные', 'комфорт'],
    activity: ['yoga', 'casual'],
    material: '92% нейлон, 8% спандекс',
    features: ['Бесшовная технология', 'Эффект второй кожи', 'Мягкая ткань'],
    colorCount: 3,
  },
  // Топы и майки (3)
  {
    categorySlug: 'tops',
    name: 'Топ для йоги Zen',
    slug: 'top-yoga-zen',
    description: 'Свободный топ для йоги из дышащей ткани. Удлинённая спинка для комфорта при наклонах. Мягкий материал не сковывает движения.',
    shortDescription: 'Свободный топ из дышащей ткани для йоги',
    sku: 'TP-ZEN-01',
    price: 2800,
    tags: ['йога', 'свободный крой'],
    activity: ['yoga', 'casual'],
    material: '95% модал, 5% эластан',
    features: ['Свободный крой', 'Удлинённая спинка', 'Дышащая ткань'],
    colorCount: 4,
  },
  {
    categorySlug: 'tops',
    name: 'Майка для тренировок Power',
    slug: 'tank-top-power',
    description: 'Облегающая майка с технологией влагоотведения. Racerback-крой обеспечивает свободу движений. Быстро сохнет после интенсивных тренировок.',
    shortDescription: 'Облегающая майка с влагоотведением',
    sku: 'TP-PWR-01',
    price: 2200,
    compareAtPrice: 2800,
    tags: ['облегающая', 'влагоотведение'],
    activity: ['gym', 'running'],
    material: '88% полиэстер, 12% эластан',
    features: ['Racerback-крой', 'Влагоотведение', 'Быстрое высыхание'],
    colorCount: 3,
  },
  {
    categorySlug: 'tops',
    name: 'Кроп-топ Active',
    slug: 'crop-top-active',
    description: 'Укороченный топ для активных тренировок. Плотная эластичная ткань обеспечивает поддержку. Идеально сочетается с леггинсами высокой посадки.',
    shortDescription: 'Укороченный топ для активных тренировок',
    sku: 'TP-ACT-01',
    price: 1900,
    tags: ['кроп-топ', 'активные тренировки'],
    activity: ['gym'],
    material: '80% нейлон, 20% спандекс',
    features: ['Укороченная длина', 'Эластичная ткань', 'Поддержка'],
    colorCount: 4,
  },
  // Спортивные бра (3)
  {
    categorySlug: 'sports-bras',
    name: 'Спортивный бра Impact',
    slug: 'sports-bra-impact',
    description: 'Спортивный бра высокой поддержки для интенсивных тренировок. Широкие регулируемые бретели и усиленная нижняя полоса.',
    shortDescription: 'Бра высокой поддержки для интенсивных тренировок',
    sku: 'SB-IMP-01',
    price: 3200,
    tags: ['высокая поддержка', 'интенсив'],
    activity: ['running', 'gym'],
    material: '75% полиэстер, 25% эластан',
    features: ['Высокая поддержка', 'Регулируемые бретели', 'Влагоотведение'],
    colorCount: 3,
  },
  {
    categorySlug: 'sports-bras',
    name: 'Спортивный бра Soft Touch',
    slug: 'sports-bra-soft-touch',
    description: 'Мягкий бра средней поддержки для йоги и пилатеса. Бесшовная конструкция и мягкие чашки для максимального комфорта.',
    shortDescription: 'Мягкий бра средней поддержки для йоги',
    sku: 'SB-SFT-01',
    price: 2500,
    tags: ['средняя поддержка', 'йога'],
    activity: ['yoga'],
    material: '90% нейлон, 10% спандекс',
    features: ['Средняя поддержка', 'Бесшовная конструкция', 'Мягкие чашки'],
    colorCount: 3,
  },
  {
    categorySlug: 'sports-bras',
    name: 'Спортивный бра Minimal',
    slug: 'sports-bra-minimal',
    description: 'Лёгкий бра для низкоинтенсивных тренировок. Тонкие бретели и минималистичный дизайн. Можно носить как самостоятельный топ.',
    shortDescription: 'Лёгкий бра для повседневности и лёгких тренировок',
    sku: 'SB-MIN-01',
    price: 1800,
    tags: ['лёгкая поддержка', 'минимализм'],
    activity: ['yoga', 'casual'],
    material: '82% нейлон, 18% спандекс',
    features: ['Лёгкая поддержка', 'Тонкие бретели', 'Минималистичный дизайн'],
    colorCount: 4,
  },
  // Шорты (3)
  {
    categorySlug: 'shorts',
    name: 'Шорты для бега SpeedRun',
    slug: 'shorts-speedrun',
    description: 'Ультралёгкие шорты для бега с внутренними подтрусниками. Боковые разрезы обеспечивают свободу движений при спринтах.',
    shortDescription: 'Ультралёгкие беговые шорты с подтрусниками',
    sku: 'SH-SPD-01',
    price: 2800,
    tags: ['бег', 'ультралёгкие'],
    activity: ['running'],
    material: '100% полиэстер',
    features: ['Внутренние подтрусники', 'Боковые разрезы', 'Ультралёгкая ткань'],
    colorCount: 3,
  },
  {
    categorySlug: 'shorts',
    name: 'Шорты велосипедки Fit',
    slug: 'shorts-biker-fit',
    description: 'Облегающие шорты-велосипедки длиной до колена. Компрессионная ткань поддерживает мышцы. Широкий пояс не скручивается.',
    shortDescription: 'Облегающие шорты-велосипедки с компрессией',
    sku: 'SH-FIT-01',
    price: 2400,
    compareAtPrice: 3000,
    tags: ['велосипедки', 'компрессия'],
    activity: ['gym', 'yoga'],
    material: '78% нейлон, 22% спандекс',
    features: ['Компрессия', 'Широкий пояс', 'Длина до колена'],
    colorCount: 3,
  },
  {
    categorySlug: 'shorts',
    name: 'Шорты свободные Breeze',
    slug: 'shorts-breeze',
    description: 'Свободные шорты для тренировок с эластичным поясом и шнурком. Лёгкая дышащая ткань и боковые карманы.',
    shortDescription: 'Свободные шорты из дышащей ткани',
    sku: 'SH-BRZ-01',
    price: 2100,
    tags: ['свободный крой', 'дышащие'],
    activity: ['gym', 'casual'],
    material: '90% полиэстер, 10% эластан',
    features: ['Свободный крой', 'Эластичный пояс', 'Боковые карманы'],
    colorCount: 2,
  },
  // Костюмы (2)
  {
    categorySlug: 'sets',
    name: 'Комплект для йоги Harmony',
    slug: 'set-yoga-harmony',
    description: 'Комплект из бра и леггинсов для йоги. Мягкая бесшовная ткань с нежным рисунком. Идеальное сочетание стиля и комфорта.',
    shortDescription: 'Комплект бра + леггинсы для йоги',
    sku: 'ST-HRM-01',
    price: 6500,
    compareAtPrice: 7800,
    tags: ['комплект', 'йога'],
    activity: ['yoga'],
    material: '88% нейлон, 12% спандекс',
    features: ['Бесшовная ткань', 'Координированные цвета', 'Средняя поддержка'],
    colorCount: 3,
  },
  {
    categorySlug: 'sets',
    name: 'Комплект для зала GymSet Pro',
    slug: 'set-gym-pro',
    description: 'Спортивный комплект из топа и леггинсов для тренажёрного зала. Компрессионная ткань и стильный дизайн для уверенных тренировок.',
    shortDescription: 'Комплект топ + леггинсы для тренажёрного зала',
    sku: 'ST-GYM-01',
    price: 7200,
    tags: ['комплект', 'зал'],
    activity: ['gym'],
    material: '75% полиэстер, 25% эластан',
    features: ['Компрессия', 'Влагоотведение', 'Координированные цвета'],
    colorCount: 2,
  },
  // Худи и свитшоты (2)
  {
    categorySlug: 'hoodies',
    name: 'Худи оверсайз Cozy',
    slug: 'hoodie-cozy-oversize',
    description: 'Оверсайз худи из мягкого хлопкового трикотажа. Объёмный капюшон и карман-кенгуру. Идеально для разминки и прогулок.',
    shortDescription: 'Оверсайз худи из мягкого трикотажа',
    sku: 'HD-CZY-01',
    price: 4800,
    tags: ['оверсайз', 'хлопок'],
    activity: ['casual'],
    material: '80% хлопок, 20% полиэстер',
    features: ['Оверсайз крой', 'Капюшон', 'Карман-кенгуру'],
    colorCount: 3,
  },
  {
    categorySlug: 'hoodies',
    name: 'Свитшот спортивный Motion',
    slug: 'sweatshirt-motion',
    description: 'Спортивный свитшот с круглым вырезом и рукавами-реглан. Начёс внутри для тепла. Рифлёные манжеты и подол.',
    shortDescription: 'Свитшот с начёсом и рукавами-реглан',
    sku: 'HD-MTN-01',
    price: 3900,
    tags: ['свитшот', 'начёс'],
    activity: ['casual', 'gym'],
    material: '70% хлопок, 30% полиэстер',
    features: ['Начёс внутри', 'Рукава-реглан', 'Рифлёные манжеты'],
    colorCount: 3,
  },
  // Куртки (2)
  {
    categorySlug: 'jackets',
    name: 'Ветровка для бега WindShield',
    slug: 'jacket-windshield',
    description: 'Лёгкая ветровка с защитой от ветра и дождя. Упаковывается в собственный карман. Светоотражающие элементы для вечернего бега.',
    shortDescription: 'Лёгкая ветровка с защитой от непогоды',
    sku: 'JK-WND-01',
    price: 5800,
    tags: ['ветровка', 'бег', 'светоотражение'],
    activity: ['running'],
    material: '100% нейлон с покрытием DWR',
    features: ['Ветрозащита', 'Водоотталкивающая пропитка', 'Светоотражатели', 'Складывается в карман'],
    colorCount: 2,
  },
  {
    categorySlug: 'jackets',
    name: 'Куртка утеплённая WarmUp',
    slug: 'jacket-warmup',
    description: 'Утеплённая куртка на молнии для тренировок в прохладную погоду. Флисовая подкладка и воротник-стойка для дополнительного тепла.',
    shortDescription: 'Утеплённая куртка на молнии для прохладной погоды',
    sku: 'JK-WRM-01',
    price: 7500,
    compareAtPrice: 9000,
    tags: ['утеплённая', 'флис'],
    activity: ['running', 'casual'],
    material: '90% полиэстер, 10% эластан, подкладка — флис',
    features: ['Флисовая подкладка', 'Молния', 'Воротник-стойка', 'Боковые карманы'],
    colorCount: 2,
  },
  // Аксессуары (3)
  {
    categorySlug: 'accessories',
    name: 'Спортивная повязка на голову FlexBand',
    slug: 'headband-flexband',
    description: 'Эластичная повязка на голову с силиконовым покрытием на внутренней стороне. Не скользит во время тренировок и впитывает влагу.',
    shortDescription: 'Эластичная повязка на голову с антискользящим покрытием',
    sku: 'AC-HBD-01',
    price: 800,
    tags: ['повязка', 'аксессуар'],
    activity: ['running', 'gym', 'yoga'],
    material: '85% полиэстер, 15% спандекс',
    features: ['Антискольжение', 'Впитывание влаги', 'Универсальный размер'],
    colorCount: 4,
  },
  {
    categorySlug: 'accessories',
    name: 'Спортивная сумка GymBag',
    slug: 'gym-bag',
    description: 'Вместительная спортивная сумка с отделением для обуви и влажных вещей. Регулируемый ремень и ручки.',
    shortDescription: 'Спортивная сумка с отделением для обуви',
    sku: 'AC-BAG-01',
    price: 3500,
    tags: ['сумка', 'аксессуар'],
    activity: ['gym'],
    material: '100% полиэстер 600D',
    features: ['Отделение для обуви', 'Водонепроницаемый карман', 'Регулируемый ремень'],
    colorCount: 2,
  },
  {
    categorySlug: 'accessories',
    name: 'Перчатки для фитнеса GripPro',
    slug: 'gloves-grippro',
    description: 'Перчатки для фитнеса с усиленным хватом и вентиляцией. Защищают ладони при работе с тяжёлыми весами.',
    shortDescription: 'Перчатки с усиленным хватом для фитнеса',
    sku: 'AC-GLV-01',
    price: 1500,
    tags: ['перчатки', 'фитнес'],
    activity: ['gym'],
    material: '60% нейлон, 30% кожа, 10% спандекс',
    features: ['Усиленный хват', 'Вентиляция', 'Лёгкое снятие'],
    colorCount: 2,
  },
];

export async function seedProducts(
  dataSource: DataSource,
  categoryMap: Map<string, Category>,
): Promise<void> {
  const repository = dataSource.getMongoRepository(Product);

  await repository.deleteMany({});
  console.log('  Cleared products collection');

  const products = productsData.map((data) => {
    const category = categoryMap.get(data.categorySlug);
    if (!category) {
      throw new Error(`Category not found: ${data.categorySlug}`);
    }

    return repository.create({
      name: data.name,
      slug: data.slug,
      description: data.description,
      shortDescription: data.shortDescription,
      sku: data.sku,
      price: data.price,
      compareAtPrice: data.compareAtPrice,
      categoryId: category._id,
      tags: data.tags,
      images: [],
      variants: generateVariants(data.colorCount, data.sku, data.price),
      attributes: {
        material: data.material,
        activity: data.activity,
        features: data.features,
      },
      rating: 0,
      reviewsCount: 0,
      soldCount: 0,
      status: ProductStatus.ACTIVE,
      isVisible: true,
      seo: {
        title: data.name,
        description: data.shortDescription,
        keywords: data.tags,
      },
    });
  });

  await repository.save(products);
  console.log(`  Seeded ${products.length} products`);
}
