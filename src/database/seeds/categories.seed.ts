import { DataSource } from 'typeorm';
import { Category } from '@/modules/categories/entities/category.entity';

const categoriesData = [
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

export async function seedCategories(dataSource: DataSource): Promise<Map<string, Category>> {
  const repository = dataSource.getMongoRepository(Category);

  await repository.deleteMany({});
  console.log('  Cleared categories collection');

  const categories = categoriesData.map((cat) => repository.create(cat));
  const saved = await repository.save(categories);

  const categoryMap = new Map<string, Category>();
  for (const cat of saved) {
    categoryMap.set(cat.slug, cat);
  }

  console.log(`  Seeded ${saved.length} categories`);
  return categoryMap;
}
