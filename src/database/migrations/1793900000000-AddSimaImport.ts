import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Импорт выгрузок Сималенда (кнопка «Загрузка с Сималенд» в админке):
 *  - sima_import_jobs — история фоновых загрузок с фазовым прогрессом
 *    (scrape → images → products) и отменой;
 *  - sima_model_links — накопительный кэль склейки цветов: sid → ключ модели
 *    (min sid компоненты «Вариантов») + нормализованное имя цвета. Повторные
 *    импорты не перекачивают страницы.
 */
export class AddSimaImport1793900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."sima_import_job_status_enum"
          AS ENUM ('pending', 'processing', 'completed', 'failed', 'canceled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."sima_import_job_phase_enum"
          AS ENUM ('scrape', 'images', 'products', 'done');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sima_import_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "status" "public"."sima_import_job_status_enum" NOT NULL DEFAULT 'pending',
        "phase" "public"."sima_import_job_phase_enum" NOT NULL DEFAULT 'scrape',
        "fileName" varchar(255) NOT NULL,
        "fileKey" varchar(512) NOT NULL,
        "options" jsonb NOT NULL DEFAULT '{}',
        "totalItems" integer NOT NULL DEFAULT 0,
        "processedItems" integer NOT NULL DEFAULT 0,
        "scrapeTotal" integer NOT NULL DEFAULT 0,
        "scrapeDone" integer NOT NULL DEFAULT 0,
        "imagesTotal" integer NOT NULL DEFAULT 0,
        "imagesDone" integer NOT NULL DEFAULT 0,
        "createdCount" integer NOT NULL DEFAULT 0,
        "updatedCount" integer NOT NULL DEFAULT 0,
        "errorCount" integer NOT NULL DEFAULT 0,
        "errors" jsonb NOT NULL DEFAULT '[]',
        "cancelRequested" boolean NOT NULL DEFAULT false,
        "startedAt" TIMESTAMP,
        "finishedAt" TIMESTAMP,
        "createdBy" uuid NOT NULL,
        CONSTRAINT "PK_sima_import_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sima_model_links" (
        "sid" bigint NOT NULL,
        "modelKey" bigint NOT NULL,
        "colorName" varchar(64),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sima_model_links" PRIMARY KEY ("sid")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sima_model_links_modelKey"
        ON "sima_model_links" ("modelKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sima_model_links_modelKey"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "sima_model_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sima_import_jobs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."sima_import_job_phase_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."sima_import_job_status_enum"`,
    );
  }
}
