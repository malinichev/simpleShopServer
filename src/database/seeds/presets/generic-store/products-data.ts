import type { ProductData } from '../fashion/products-data';

export const colors = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Blue', hex: '#1E40AF' },
];

export const sizes = ['S', 'M', 'L', 'XL'];

export const imagesByCategory: Record<string, Record<string, string>> = {
  clothing: {
    Black:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    White:
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80',
    Gray: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&q=80',
    Blue: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80',
  },
  footwear: {
    Black:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80',
    White:
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80',
    Gray: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80',
    Blue: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&q=80',
  },
  accessories: {
    Black:
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
    White:
      'https://images.unsplash.com/photo-1575537302964-96cd47c06b1b?w=800&q=80',
    Gray: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=800&q=80',
    Blue: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&q=80',
  },
  sale: {
    Black:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    White:
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80',
    Gray: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&q=80',
    Blue: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80',
  },
};

export const productsData: ProductData[] = [
  {
    categorySlug: 'clothing',
    name: 'Sample T-Shirt',
    slug: 'sample-tshirt',
    description:
      'A high-quality sample t-shirt to demonstrate product page layout. Replace with your own product description.',
    shortDescription: 'High-quality sample t-shirt',
    sku: 'CL-TSHIRT-01',
    price: 1500,
    tags: ['sample', 'casual'],
    activity: ['casual'],
    material: '100% cotton',
    features: ['Sample feature 1', 'Sample feature 2'],
    colorCount: 3,
  },
  {
    categorySlug: 'clothing',
    name: 'Sample Hoodie',
    slug: 'sample-hoodie',
    description:
      'Sample hoodie product for demo purposes. Replace with real product data.',
    shortDescription: 'Sample hoodie',
    sku: 'CL-HOODIE-01',
    price: 3500,
    compareAtPrice: 4500,
    tags: ['sample', 'sale'],
    activity: ['casual'],
    material: '80% cotton, 20% polyester',
    features: ['Sample feature 1', 'Sample feature 2'],
    colorCount: 2,
  },
  {
    categorySlug: 'footwear',
    name: 'Sample Sneakers',
    slug: 'sample-sneakers',
    description: 'Comfortable sample sneakers for everyday wear. Demo product.',
    shortDescription: 'Sample sneakers',
    sku: 'FW-SNK-01',
    price: 4900,
    tags: ['sample'],
    activity: ['casual'],
    material: 'Mesh upper, rubber sole',
    features: ['Lightweight', 'Cushioned sole'],
    colorCount: 3,
  },
  {
    categorySlug: 'accessories',
    name: 'Sample Tote Bag',
    slug: 'sample-tote-bag',
    description:
      'Eco-friendly sample tote bag. Replace with your own accessory.',
    shortDescription: 'Sample tote bag',
    sku: 'AC-TOTE-01',
    price: 1200,
    tags: ['sample', 'eco'],
    activity: ['casual'],
    material: '100% organic cotton',
    features: ['Reinforced straps', 'Inner pocket'],
    colorCount: 2,
  },
  {
    categorySlug: 'accessories',
    name: 'Sample Cap',
    slug: 'sample-cap',
    description:
      'Adjustable sample cap. Demo product to populate accessories category.',
    shortDescription: 'Sample cap',
    sku: 'AC-CAP-01',
    price: 800,
    tags: ['sample'],
    activity: ['casual'],
    material: '100% cotton',
    features: ['Adjustable strap', 'Embroidered logo'],
    colorCount: 3,
  },
  {
    categorySlug: 'sale',
    name: 'Sample Sale Item',
    slug: 'sample-sale-item',
    description: 'Discounted sample item to demonstrate sale category.',
    shortDescription: 'Sample sale item',
    sku: 'SL-001',
    price: 999,
    compareAtPrice: 1999,
    tags: ['sample', 'sale', 'clearance'],
    activity: ['casual'],
    material: 'Mixed materials',
    features: ['50% off', 'Limited stock'],
    colorCount: 2,
  },
];

export type { ProductData };
