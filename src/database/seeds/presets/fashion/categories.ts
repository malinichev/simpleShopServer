export interface CategoryData {
  name: string;
  slug: string;
  description: string;
  order: number;
  isActive: boolean;
}

export const categoriesData: CategoryData[] = [
  {
    name: 'Леггинсы',
    slug: 'leggings',
    description: 'Спортивные леггинсы для тренировок и повседневной носки',
    order: 1,
    isActive: true,
  },
  {
    name: 'Топы и майки',
    slug: 'tops',
    description: 'Спортивные топы и майки для любых тренировок',
    order: 2,
    isActive: true,
  },
  {
    name: 'Спортивные бра',
    slug: 'sports-bras',
    description: 'Спортивные бра с разной степенью поддержки',
    order: 3,
    isActive: true,
  },
  {
    name: 'Шорты',
    slug: 'shorts',
    description: 'Спортивные шорты для бега и тренировок',
    order: 4,
    isActive: true,
  },
  {
    name: 'Костюмы',
    slug: 'sets',
    description: 'Спортивные костюмы и комплекты',
    order: 5,
    isActive: true,
  },
  {
    name: 'Худи и свитшоты',
    slug: 'hoodies',
    description: 'Худи и свитшоты для спорта и отдыха',
    order: 6,
    isActive: true,
  },
  {
    name: 'Куртки',
    slug: 'jackets',
    description: 'Спортивные куртки и ветровки',
    order: 7,
    isActive: true,
  },
  {
    name: 'Аксессуары',
    slug: 'accessories',
    description: 'Спортивные аксессуары: повязки, перчатки, сумки',
    order: 8,
    isActive: true,
  },
];
