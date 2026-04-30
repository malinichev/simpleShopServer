import { DataSource } from 'typeorm';
import { Category } from '@/modules/categories/entities/category.entity';
import type { CategoryData } from './presets/fashion/categories';

type CategoriesModule = { categoriesData: CategoryData[] };

async function loadPreset(): Promise<CategoryData[]> {
  const preset = process.env.SEED_PRESET || 'generic-store';
  const mod = (await import(
    `./presets/${preset}/categories`
  )) as CategoriesModule;
  return mod.categoriesData;
}

export async function seedCategories(
  dataSource: DataSource,
): Promise<Map<string, Category>> {
  const repository = dataSource.getRepository(Category);
  const data = await loadPreset();

  const categories = data.map((cat) => repository.create(cat));
  const saved = await repository.save(categories);

  const categoryMap = new Map<string, Category>();
  for (const cat of saved) {
    categoryMap.set(cat.slug, cat);
  }

  console.log(
    `  Seeded ${saved.length} categories (preset: ${process.env.SEED_PRESET || 'generic-store'})`,
  );
  return categoryMap;
}
