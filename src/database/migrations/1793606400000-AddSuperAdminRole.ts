import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Роль «главный администратор» (super_admin).
 *
 * Создаётся только скриптом deploy/create-admin.sh или другим главным
 * администратором из админки. Только main-админам доступны бэкап/рестор БД
 * и управление главными администраторами (см. RolesGuard / UsersService).
 *
 * Добавление значения в enum безопасно для существующих данных.
 * PG12+ разрешает ADD VALUE внутри транзакции миграции.
 */
export class AddSuperAdminRole1793606400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'super_admin'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL не умеет удалять значения enum — откат не поддерживается
  }
}
