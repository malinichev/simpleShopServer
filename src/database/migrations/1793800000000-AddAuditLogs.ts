import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Журнал действий (audit_logs): кто/когда/что изменил по заказам, платежам
 * и админ-операциям. Снимки before/after — jsonb.
 */
export class AddAuditLogs1793800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."audit_logs_actor_type_enum"
          AS ENUM ('user', 'admin', 'system');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "actorType" "public"."audit_logs_actor_type_enum" NOT NULL DEFAULT 'system',
        "actorId" varchar(64),
        "action" varchar(64) NOT NULL,
        "entity" varchar(32) NOT NULL,
        "entityId" varchar(64) NOT NULL,
        "before" jsonb,
        "after" jsonb,
        "requestId" varchar(64),
        "ip" varchar(64),
        "userAgent" varchar(512),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity"
        ON "audit_logs" ("entity", "entityId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actorId"
        ON "audit_logs" ("actorId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt"
        ON "audit_logs" ("createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_actorId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."audit_logs_actor_type_enum"`,
    );
  }
}
