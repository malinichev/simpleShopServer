import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Order,
  OrderStatus,
  PaymentStatus,
} from '@/modules/orders/entities/order.entity';
import { OrderItemEntity } from '@/modules/orders/entities/order-item.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { ProductVariantEntity } from '@/modules/products/entities/product-variant.entity';
import { User, UserRole, Address } from '@/modules/users/entities/user.entity';

const DAYS_BACK = 60;

const cities = [
  { city: 'Москва', postalCode: '101000', street: 'Тверская', building: '12' },
  {
    city: 'Санкт-Петербург',
    postalCode: '190000',
    street: 'Невский проспект',
    building: '78',
  },
  { city: 'Казань', postalCode: '420000', street: 'Баумана', building: '34' },
  {
    city: 'Екатеринбург',
    postalCode: '620000',
    street: 'Ленина',
    building: '56',
  },
  {
    city: 'Новосибирск',
    postalCode: '630000',
    street: 'Красный проспект',
    building: '90',
  },
];

const shippingMethods = ['СДЭК', 'Почта России', 'Boxberry'];
const paymentMethods = ['card', 'sbp', 'cash_on_delivery'];

function pickWeighted<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.value;
  }
  return items[items.length - 1].value;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Возвращает (status, paymentStatus) с распределением, зависящим от возраста заказа.
 */
function pickStatuses(daysAgo: number): {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
} {
  let status: OrderStatus;
  if (daysAgo > 14) {
    status = pickWeighted([
      { value: OrderStatus.DELIVERED, weight: 65 },
      { value: OrderStatus.CANCELLED, weight: 12 },
      { value: OrderStatus.REFUNDED, weight: 3 },
      { value: OrderStatus.SHIPPED, weight: 5 },
      { value: OrderStatus.PROCESSING, weight: 5 },
      { value: OrderStatus.CONFIRMED, weight: 5 },
      { value: OrderStatus.PENDING, weight: 5 },
    ]);
  } else if (daysAgo > 3) {
    status = pickWeighted([
      { value: OrderStatus.SHIPPED, weight: 35 },
      { value: OrderStatus.DELIVERED, weight: 20 },
      { value: OrderStatus.PROCESSING, weight: 20 },
      { value: OrderStatus.CONFIRMED, weight: 10 },
      { value: OrderStatus.CANCELLED, weight: 10 },
      { value: OrderStatus.PENDING, weight: 5 },
    ]);
  } else {
    status = pickWeighted([
      { value: OrderStatus.PENDING, weight: 35 },
      { value: OrderStatus.CONFIRMED, weight: 25 },
      { value: OrderStatus.PROCESSING, weight: 20 },
      { value: OrderStatus.SHIPPED, weight: 10 },
      { value: OrderStatus.CANCELLED, weight: 10 },
    ]);
  }

  let paymentStatus: PaymentStatus;
  switch (status) {
    case OrderStatus.PENDING:
      paymentStatus = PaymentStatus.PENDING;
      break;
    case OrderStatus.CANCELLED:
      paymentStatus = pickWeighted([
        { value: PaymentStatus.FAILED, weight: 60 },
        { value: PaymentStatus.PENDING, weight: 30 },
        { value: PaymentStatus.REFUNDED, weight: 10 },
      ]);
      break;
    case OrderStatus.REFUNDED:
      paymentStatus = PaymentStatus.REFUNDED;
      break;
    default:
      paymentStatus = PaymentStatus.PAID;
  }

  return { status, paymentStatus };
}

/**
 * Сколько заказов сгенерировать в этот день. Свежие дни — больше нагрузка
 * (имитация роста), редкие пустые/слабые дни.
 */
function ordersForDay(daysAgo: number): number {
  const recencyBoost = Math.max(0, 7 - daysAgo) * 1.5; // 0..10
  const base = rand(2, 8);
  // Иногда пустой день — реалистичность
  if (Math.random() < 0.05) return 0;
  return Math.round(base + recencyBoost);
}

function buildAddress(user: User): Address {
  if (user.addresses && user.addresses.length > 0) return user.addresses[0];
  const c = pickRandom(cities);
  return {
    id: uuidv4(),
    title: 'Дом',
    firstName: user.firstName,
    lastName: user.lastName,
    phone: '+79991234567',
    city: c.city,
    street: c.street,
    building: c.building,
    apartment: String(rand(1, 200)),
    postalCode: c.postalCode,
    isDefault: true,
  };
}

interface VariantWithProduct {
  variant: ProductVariantEntity;
  product: Product;
}

export async function seedOrders(dataSource: DataSource): Promise<void> {
  const orderRepo = dataSource.getRepository(Order);
  const itemRepo = dataSource.getRepository(OrderItemEntity);
  const userRepo = dataSource.getRepository(User);
  const productRepo = dataSource.getRepository(Product);
  const variantRepo = dataSource.getRepository(ProductVariantEntity);

  const customers = await userRepo.find({ where: { role: UserRole.CUSTOMER } });
  if (customers.length === 0) {
    throw new Error('No customer users found — run seedUsers first');
  }
  const products = await productRepo.find();
  const allVariants = await variantRepo.find();

  // Map variants to their products for snapshot fields
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantPool: VariantWithProduct[] = allVariants
    .filter((v) => v.stock > 0)
    .map((v) => {
      const product = productById.get(v.productId);
      return product ? { variant: v, product } : null;
    })
    .filter((x): x is VariantWithProduct => x !== null);

  if (variantPool.length === 0) {
    throw new Error('No variants in stock — run seedProducts first');
  }

  let orderSequence = 1;
  const year = new Date().getFullYear();
  let totalOrders = 0;
  let totalItems = 0;

  for (let daysAgo = DAYS_BACK; daysAgo >= 0; daysAgo--) {
    const dayCount = ordersForDay(daysAgo);

    for (let i = 0; i < dayCount; i++) {
      const customer = pickRandom(customers);
      const itemCount = rand(1, 4);
      const orderItems: OrderItemEntity[] = [];
      let subtotal = 0;
      const usedVariantIds = new Set<string>();

      for (let j = 0; j < itemCount; j++) {
        // Avoid duplicate variants in same order
        let pick: VariantWithProduct | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = pickRandom(variantPool);
          if (!usedVariantIds.has(candidate.variant.id)) {
            pick = candidate;
            usedVariantIds.add(candidate.variant.id);
            break;
          }
        }
        if (!pick) continue;

        const { variant, product } = pick;
        const price = variant.price ?? product.price;
        const quantity = rand(1, 2);
        const total = price * quantity;
        const image = product.images?.[0]?.url ?? '';

        const item = itemRepo.create({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          slug: product.slug,
          sku: variant.sku,
          image,
          size: variant.size,
          color: product.color ?? '',
          price,
          quantity,
          total,
        });
        orderItems.push(item);
        subtotal += total;
      }

      if (orderItems.length === 0) continue;

      const shipping = pickRandom([0, 300, 500, 700]);
      const total = subtotal + shipping;
      const { status, paymentStatus } = pickStatuses(daysAgo);

      // createdAt: на тот день в случайный час 9-22
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      createdAt.setHours(rand(9, 22), rand(0, 59), rand(0, 59), 0);

      const order = orderRepo.create({
        orderNumber: `SP-${year}-${String(orderSequence++).padStart(6, '0')}`,
        userId: customer.id,
        subtotal,
        discount: 0,
        shipping,
        total,
        status,
        paymentStatus,
        shippingAddress: buildAddress(customer),
        shippingMethod: pickRandom(shippingMethods),
        paymentMethod: pickRandom(paymentMethods),
        history: [
          {
            status,
            createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      } as Partial<Order>);

      const savedOrder = await orderRepo.save(order);

      // Force createdAt (TypeORM может перезаписать timestamp при @CreateDateColumn)
      await orderRepo.update(savedOrder.id, {
        createdAt,
        updatedAt: createdAt,
      } as Partial<Order>);

      for (const item of orderItems) {
        item.orderId = savedOrder.id;
      }
      await itemRepo.save(orderItems);

      totalOrders++;
      totalItems += orderItems.length;
    }
  }

  console.log(
    `  Seeded ${totalOrders} orders with ${totalItems} items over ${DAYS_BACK} days`,
  );
}
