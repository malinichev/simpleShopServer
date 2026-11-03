import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Синк остатков с Сималенда:
 *  - таблица stock_sync_runs — история прогонов (якорь «продажи после
 *    прошлого прогона» для вычета + статус для поллинга кнопкой в админке).
 */
export class AddStockSyncRuns1793700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."stock_sync_run_status_enum"
          AS ENUM ('running', 'succeeded', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_sync_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "status" "public"."stock_sync_run_status_enum" NOT NULL DEFAULT 'running',
        "trigger" varchar(32) NOT NULL DEFAULT 'manual',
        "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "finishedAt" TIMESTAMP,
        "totalVariants" integer NOT NULL DEFAULT 0,
        "processedVariants" integer NOT NULL DEFAULT 0,
        "updatedCount" integer NOT NULL DEFAULT 0,
        "zeroedCount" integer NOT NULL DEFAULT 0,
        "errorCount" integer NOT NULL DEFAULT 0,
        "errors" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_stock_sync_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_stock_sync_runs_startedAt"
        ON "stock_sync_runs" ("startedAt" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_sync_runs_startedAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_sync_runs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."stock_sync_run_status_enum"`,
    );
  }
}
