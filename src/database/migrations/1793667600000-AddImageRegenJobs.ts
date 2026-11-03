import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ИИ-регенерация фото товара:
 *  - таблица image_regen_jobs (job'ы генерации, статус для поллинга админкой);
 *  - settings.aiImagePrompts — редактируемый базовый промпт стиля + пресеты
 *    сцен (дефолт = [BASE STYLE] из docs/PRODUCT_PHOTO_STYLE.md; тот же текст
 *    в DEFAULT_AI_IMAGE_PROMPTS из entities/settings.entity.ts).
 */
export class AddImageRegenJobs1793667600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."image_regen_job_status_enum"
          AS ENUM ('pending', 'processing', 'completed', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "image_regen_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "status" "public"."image_regen_job_status_enum" NOT NULL DEFAULT 'pending',
        "productId" uuid NOT NULL,
        "prompt" text NOT NULL,
        "composedPrompt" text NOT NULL DEFAULT '',
        "model" varchar(255) NOT NULL DEFAULT '',
        "items" jsonb NOT NULL DEFAULT '[]',
        "totalImages" integer NOT NULL DEFAULT 0,
        "processedImages" integer NOT NULL DEFAULT 0,
        "successCount" integer NOT NULL DEFAULT 0,
        "errorCount" integer NOT NULL DEFAULT 0,
        "errors" jsonb NOT NULL DEFAULT '[]',
        "createdBy" uuid NOT NULL,
        CONSTRAINT "PK_image_regen_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_image_regen_product"
        ON "image_regen_jobs" ("productId")`,
    );

    await queryRunner.query(`
      ALTER TABLE "settings"
        ADD COLUMN IF NOT EXISTS "aiImagePrompts" jsonb NOT NULL
        DEFAULT '{"basePrompt":"Professional e-commerce lifestyle photography for SVOY BRAND, a women''s homewear, loungewear and sportswear label. Natural-looking female model in her late 20s to mid 30s, soft natural beauty, genuine relaxed emotion, confident femininity and a subtle tasteful sensuality — attractive, gently alluring, never vulgar. Flattering pose that shows the feminine silhouette and makes the garment desirable. Soft warm natural light, warm light palette, editorial fashion quality, clean uncluttered composition. The garment is the hero of the shot: sharp focus, fabric, cut and colors exactly as in the reference photo. The setting and activity show a real-life scenario in which the buyer would actually use this garment.","presets":[{"id":"tea-before-sleep","title":"Чай перед сном","prompt":"Evening wind-down: the model sits in a cozy bedroom holding a cup of herbal tea, warm lamp light, soft blanket nearby, calm bedtime mood."},{"id":"morning-home","title":"Утро дома","prompt":"Fresh morning at home: the model stretches near a window with sheer curtains, sunlight on wooden floor, light and airy start-of-the-day mood."},{"id":"yoga-home","title":"Йога дома","prompt":"Home yoga session: the model does a gentle stretch on a mat in a bright living room, calm and focused, minimal props, breathing-room composition."},{"id":"bath-spa","title":"Ванная / спа","prompt":"Spa mood: the model by a mirror in a light bathroom, soft towels and skincare on the shelf, fresh clean atmosphere, steam-warm light."}]}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN IF EXISTS "aiImagePrompts"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_image_regen_product"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "image_regen_jobs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."image_regen_job_status_enum"`,
    );
  }
}
