import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExternalReviews1793884781962 implements MigrationInterface {
    name = 'AddExternalReviews1793884781962'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."reviews_sync_runs_status_enum" AS ENUM('running', 'succeeded', 'failed')`);
        await queryRunner.query(`CREATE TABLE "reviews_sync_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."reviews_sync_runs_status_enum" NOT NULL DEFAULT 'running', "trigger" character varying NOT NULL DEFAULT 'manual', "startedAt" TIMESTAMP NOT NULL, "finishedAt" TIMESTAMP, "totalProducts" integer NOT NULL DEFAULT '0', "processedProducts" integer NOT NULL DEFAULT '0', "productsWithComments" integer NOT NULL DEFAULT '0', "importedCount" integer NOT NULL DEFAULT '0', "updatedCount" integer NOT NULL DEFAULT '0', "removedCount" integer NOT NULL DEFAULT '0', "errorCount" integer NOT NULL DEFAULT '0', "errors" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_de1f455ccf845da9b2de52341b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bb9df79e9a1d376f8dfcd58d2f" ON "reviews_sync_runs" ("startedAt") `);
        await queryRunner.query(`CREATE TABLE "external_reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" uuid NOT NULL, "source" character varying NOT NULL DEFAULT 'sima-land', "externalId" integer NOT NULL, "itemSid" integer NOT NULL DEFAULT '0', "rating" integer NOT NULL, "authorName" character varying NOT NULL, "message" text NOT NULL, "pros" text, "cons" text, "reply" text, "isVerifiedPurchase" boolean NOT NULL DEFAULT false, "images" text array NOT NULL DEFAULT ARRAY[]::text[], "isHidden" boolean NOT NULL DEFAULT false, "sourceCreatedAt" TIMESTAMP, CONSTRAINT "UQ_c6fa58bc7dc0ddb103326606b3e" UNIQUE ("source", "externalId"), CONSTRAINT "PK_90d24d88beda23ee1bb8ec9dc75" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4122553fed86f4513782d112ab" ON "external_reviews" ("isHidden") `);
        await queryRunner.query(`CREATE INDEX "IDX_8e86914c74361934dbae990f41" ON "external_reviews" ("productId") `);
        await queryRunner.query(`ALTER TABLE "products" ADD "externalRating" numeric(3,2)`);
        await queryRunner.query(`ALTER TABLE "products" ADD "externalReviewsCount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "products" ADD "reviewsSyncedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "external_reviews" ADD CONSTRAINT "FK_8e86914c74361934dbae990f41f" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "external_reviews" DROP CONSTRAINT "FK_8e86914c74361934dbae990f41f"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "reviewsSyncedAt"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "externalReviewsCount"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "externalRating"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8e86914c74361934dbae990f41"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4122553fed86f4513782d112ab"`);
        await queryRunner.query(`DROP TABLE "external_reviews"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bb9df79e9a1d376f8dfcd58d2f"`);
        await queryRunner.query(`DROP TABLE "reviews_sync_runs"`);
        await queryRunner.query(`DROP TYPE "public"."reviews_sync_runs_status_enum"`);
    }

}
