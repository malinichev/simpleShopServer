import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { AuthService } from '@/modules/auth';
import { UserRole, UsersService } from '@/modules/users';

async function createAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const authService = app.get(AuthService);
  const usersService = app.get(UsersService);

  const adminData = {
    email: 'malinichev_s@mail.ru',
    password: 'Password123!',
    firstName: 'Сергей',
    lastName: 'Малиничев',
    phone: '+79842791121',
    role: UserRole.ADMIN,
  };

  try {
    // Проверяем, существует ли уже админ
    const existingUser = await usersService.findByEmail(adminData.email);
    // const existingUser2 = await usersService.findByEmail(adminData2.email);

    if (existingUser) {
      console.log('❌ Администратор уже существует:', adminData.email);
      const userIid = existingUser.id;
      await usersService.delete(userIid);
      console.log('❌ Удалили его:', adminData.email);
    }

    // Создаем админа
    const admin = await authService.register({
      ...adminData,
      password: adminData.password,
    });

    console.log('✅ Администратор успешно создан!');
    console.log('📧 Email:', admin.user.email);
    console.log('👤 Имя:', `${admin.user.firstName} ${admin.user.lastName}`);
    console.log('🔐 Роль:', admin.user.role);

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка создания администратора:', error);
    await app.close();
    process.exit(1);
  }
}

void createAdmin();
