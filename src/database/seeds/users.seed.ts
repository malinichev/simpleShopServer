import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '@/modules/users/entities/user.entity';

const usersData = [
  {
    email: 'admin@sportshop.ru',
    password: 'Admin123!',
    firstName: 'Админ',
    lastName: 'Системы',
    role: UserRole.ADMIN,
    isEmailVerified: true,
  },
  {
    email: 'manager@sportshop.ru',
    password: 'Manager123!',
    firstName: 'Менеджер',
    lastName: 'Магазина',
    role: UserRole.MANAGER,
    isEmailVerified: true,
  },
  {
    email: 'user@example.com',
    password: 'User123!',
    firstName: 'Анна',
    lastName: 'Иванова',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
];

export async function seedUsers(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getMongoRepository(User);

  await repository.deleteMany({});
  console.log('  Cleared users collection');

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
