import { UserRole } from '@/common/decorators/roles.decorator';

/**
 * Роль имеет уровень администратора: ADMIN или SUPER_ADMIN.
 * Главный администратор наследует все права обычного (RolesGuard пропускает
 * его на @Roles(ADMIN)-эндпоинтах, а ветки видимости данных проверяют этим
 * хелпером — иначе SUPER_ADMIN видел бы только «свои» заказы/отзывы).
 */
export function isAdminLevel(role: UserRole | undefined | null): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}
