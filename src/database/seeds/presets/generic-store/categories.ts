import type { CategoryData } from '../fashion/categories';

export const categoriesData: CategoryData[] = [
  {
    name: 'Одежда',
    slug: 'clothing',
    description: 'Каталог одежды',
    order: 1,
    isActive: true,
  },
  {
    name: 'Обувь',
    slug: 'footwear',
    description: 'Каталог обуви',
    order: 2,
    isActive: true,
  },
  {
    name: 'Аксессуары',
    slug: 'accessories',
    description: 'Аксессуары и дополнения',
    order: 3,
    isActive: true,
  },
  {
    name: 'Распродажа',
    slug: 'sale',
    description: 'Товары со скидкой',
    order: 4,
    isActive: true,
  },
];

export type { CategoryData };
