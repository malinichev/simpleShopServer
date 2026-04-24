import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Изменения для PR-1..3 OAuth + email change:
 *
 * 1. users.password — DROP NOT NULL (OAuth-only юзеры могут не иметь пароля)
 * 2. users.{pendingEmail, pendingEmailToken, pendingEmailExpires} — поля для
 *    двухшаговой смены email (POST /auth/request-email-change → confirm).
 * 3. user_oauth_identities — таблица привязок к OAuth-провайдерам (vk/yandex)
 *    с UNIQUE(provider, providerId) и FK → users (cascade delete).
 *
 * Идемпотентно: IF NOT EXISTS / IF EXISTS — миграцию можно рестартовать без
 * "already exists" ошибок.
 */
export class AddOAuthAndEmailChange1777020228546
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pendingEmail" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pendingEmailToken" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pendingEmailExpires" TIMESTAMP`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."user_oauth_identities_provider_enum"
          AS ENUM ('vk', 'yandex');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_oauth_identities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "provider" "public"."user_oauth_identities_provider_enum" NOT NULL,
        "providerId" varchar(255) NOT NULL,
        "email" varchar(255),
        "profileData" jsonb NOT NULL DEFAULT '{}',
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_user_oauth_identities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_oauth_provider_provider_id"
          UNIQUE ("provider", "providerId"),
        CONSTRAINT "FK_user_oauth_identities_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_oauth_user_id"
        ON "user_oauth_identities" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_oauth_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_oauth_identities"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."user_oauth_identities_provider_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "pendingEmailExpires"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "pendingEmailToken"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "pendingEmail"`,
    );

    /**
     * Откатить NOT NULL обратно НЕ можем безопасно — могут быть OAuth-only
     * юзеры с password=null, такой ALTER упадёт. Поэтому down() не трогает
     * password — если нужно вернуть прежнюю NOT NULL, удалить таких юзеров вручную.
     */
  }
}
