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
  {
    email: 'olga.petrova@example.com',
    password: 'User123!',
    firstName: 'Ольга',
    lastName: 'Петрова',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'maria.smirnova@example.com',
    password: 'User123!',
    firstName: 'Мария',
    lastName: 'Смирнова',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'ekaterina.volkova@example.com',
    password: 'User123!',
    firstName: 'Екатерина',
    lastName: 'Волкова',
    role: UserRole.CUSTOMER,
    isEmailVerified: true,
  },
  {
    email: 'natalia.kuznetsova@example.com',
    password: 'User123!',
    firstName: 'Наталья',
    lastName: 'Кузнецова',
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
