import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Этап 6 Phase 2 шаблонизации: pluggable payment providers.
 *
 * 1. payment_methods.provider — enum, дефолт 'manual'. Фронт по этому полю
 *    решает, нужен ли redirect/iframe; бэк — какой PaymentDriver вызывать.
 * 2. payment_methods.config — JSONB для provider-specific настроек (например,
 *    yookassa receipt-config или stripe payment-method types). Хранится здесь,
 *    а не в env, потому что admin может настраивать на лету.
 * 3. orders.paymentProviderTxnId — id транзакции у провайдера для обратной
 *    связи (webhook'и приходят с этим id, по нему ищем заказ).
 * 4. orders.paymentMetadata — JSONB для произвольных provider-полей
 *    (confirmation_url, capture_method, и т.д.).
 *
 * Идемпотентно: IF NOT EXISTS / DO $$ — миграция может перезапускаться.
 */
export class AddPaymentProviderColumns1777020228548
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."payment_methods_provider_enum"
          AS ENUM ('manual', 'yookassa', 'stripe', 'cloudpayments');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "provider" "public"."payment_methods_provider_enum" NOT NULL DEFAULT 'manual'`,
    );

    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "config" jsonb NOT NULL DEFAULT '{}'`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paymentProviderTxnId" varchar`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paymentMetadata" jsonb NOT NULL DEFAULT '{}'`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_orders_payment_provider_txn_id" ON "orders" ("paymentProviderTxnId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_orders_payment_provider_txn_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "paymentMetadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "paymentProviderTxnId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN IF EXISTS "config"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN IF EXISTS "provider"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."payment_methods_provider_enum"`,
    );
  }
}
