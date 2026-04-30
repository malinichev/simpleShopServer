import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Product,
  ProductStatus,
} from '@/modules/products/entities/product.entity';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';
import { Category } from '@/modules/categories/entities/category.entity';
import type { ProductData } from './presets/fashion/products-data';

interface PresetData {
  colors: { name: string; hex: string }[];
  sizes: string[];
  imagesByCategory: Record<string, Record<string, string>>;
  productsData: ProductData[];
}

async function loadPreset(): Promise<PresetData> {
  const preset = process.env.SEED_PRESET || 'generic-store';
  const mod = (await import(`./presets/${preset}/products-data`)) as PresetData;
  return mod;
}

function randomStock(): number {
  return Math.floor(Math.random() * 51);
}

function pickColors(
  colors: PresetData['colors'],
  count: number,
): PresetData['colors'] {
  const shuffled = [...colors].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getImage(
  imagesByCategory: PresetData['imagesByCategory'],
  categorySlug: string,
  colorName: string,
  productName: string,
): { id: string; url: string; alt: string; order: number; isMain?: boolean }[] {
  const catImages = imagesByCategory[categorySlug];
  const url =
    catImages?.[colorName] ??
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80';
  return [
    {
      id: `${categorySlug}-${colorName}-main`,
      url,
      alt: `${productName} — ${colorName}`,
      order: 0,
      isMain: true,
    },
  ];
}

export async function seedProducts(
  dataSource: DataSource,
  categoryMap: Map<string, Category>,
): Promise<void> {
  const productRepository = dataSource.getRepository(Product);
  const variantRepository = dataSource.getRepository(ProductVariantEntity);
  const { colors, sizes, imagesByCategory, productsData } = await loadPreset();

  for (const data of productsData) {
    const category = categoryMap.get(data.categorySlug);
    if (!category) {
      throw new Error(`Category not found: ${data.categorySlug}`);
    }

    const selectedColors = pickColors(colors, data.colorCount);
    // One modelId shared across all color variants of this model
    const modelId = selectedColors.length > 1 ? uuidv4() : null;

    for (let ci = 0; ci < selectedColors.length; ci++) {
      const color = selectedColors[ci];
      const colorSuffix = color.name.slice(0, 3).toUpperCase();
      const isFirst = ci === 0;

      const productName = isFirst ? data.name : `${data.name} (${color.name})`;

      const product = productRepository.create({
        name: productName,
        slug: isFirst ? data.slug : `${data.slug}-${color.name}`,
        description: data.description,
        shortDescription: data.shortDescription,
        sku: isFirst ? data.sku : `${data.sku}-${colorSuffix}`,
        price: data.price,
        compareAtPrice: data.compareAtPrice,
        categoryId: category.id,
        tags: data.tags,
        images: getImage(
          imagesByCategory,
          data.categorySlug,
          color.name,
          productName,
        ),
        color: color.name,
        colorHex: color.hex,
        modelId,
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
          title: productName,
          description: data.shortDescription,
          keywords: data.tags,
        },
      });

      const savedProduct = await productRepository.save(product);

      // Variants are now size-only (all same color)
      const variantEntities = sizes.map((size) =>
        variantRepository.create({
          productId: savedProduct.id,
          size,
          sku: `${savedProduct.sku}-${size}`,
          stock: randomStock(),
          price: data.price,
        }),
      );
      await variantRepository.save(variantEntities);
    }
  }

  const count = await productRepository.count();
  const variantCount = await variantRepository.count();
  console.log(
    `  Seeded ${count} products with ${variantCount} variants (preset: ${process.env.SEED_PRESET || 'generic-store'})`,
  );
}
