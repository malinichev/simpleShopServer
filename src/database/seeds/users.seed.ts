import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '@/modules/users/entities/user.entity';

// Sample-юзеры для dev/staging. На production seed запрещён без FORCE_PROD_SEED.
// Email/имена — нейтральные, для template-демо. Реальные бренд-юзеры создаются
// через `pnpm create:admin` или регистрацию.
const usersData = [
  {
    email: 'admin@example.com',
    password: 'Admin123!',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    isEmailVerified: true,
  },
  {
    email: 'manager@example.com',
    password: 'Manager123!',
    firstName: 'Manager',
    lastName: 'User',
    role: UserRole.MANAGER,
    isEmailVerified: true,
  },
  {
    email: 'user@example.com',
    password: 'User123!',
    firstName: 'Demo',
    lastName: 'Customer',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'customer2@example.com',
    password: 'User123!',
    firstName: 'Sample',
    lastName: 'Customer',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'customer3@example.com',
    password: 'User123!',
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
}
