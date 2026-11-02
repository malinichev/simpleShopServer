import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '@/modules/users/entities/user.entity';

// Sample-юзеры для dev/staging. На production seed запрещён без FORCE_PROD_SEED.
// Email/имена — нейтральные, для template-демо. Реальные бренд-юзеры создаются
// через `pnpm create:admin` или регистрацию.
//
// Пароли НЕ хранятся в коде: берутся из env (SEED_PASSWORD_ADMIN/MANAGER/CUSTOMER),
// иначе генерируются случайно и печатаются в выводе сида. Прогон сида не идемпотентен
// по паролям — для повторного входа задай env перед `pnpm seed`.

function seedPassword(envVar: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  // Случайный пароль: seed-окружение dev-only, пароль виден в консоли сида
  return `${randomUUID().slice(0, 10)}Aa!`;
}

const usersData = [
  {
    email: 'admin@example.com',
    password: seedPassword('SEED_PASSWORD_ADMIN'),
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    isEmailVerified: true,
  },
  {
    email: 'manager@example.com',
    password: seedPassword('SEED_PASSWORD_MANAGER'),
    firstName: 'Manager',
    lastName: 'User',
    role: UserRole.MANAGER,
    isEmailVerified: true,
  },
  {
    email: 'user@example.com',
    password: seedPassword('SEED_PASSWORD_CUSTOMER'),
    firstName: 'Demo',
    lastName: 'Customer',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'customer2@example.com',
    password: seedPassword('SEED_PASSWORD_CUSTOMER'),
    firstName: 'Sample',
    lastName: 'Customer',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'customer3@example.com',
    password: seedPassword('SEED_PASSWORD_CUSTOMER'),
    firstName: 'Test',
    lastName: 'Customer',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
];

export async function seedUsers(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(User);

  const users = await Promise.all(
    usersData.map(async (userData) => {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      return repository.create({
        ...userData,
        password: hashedPassword,
        addresses: [],
        wishlist: [],
      });
    }),
  );

  await repository.save(users);
  console.log(`  Seeded ${users.length} users`);
  console.log('  Пароли seed-юзеров (сгенерированы, сохраните при необходимости):');
  for (const u of usersData) {
    console.log(`    ${u.email} : ${u.password}`);
  }
}
