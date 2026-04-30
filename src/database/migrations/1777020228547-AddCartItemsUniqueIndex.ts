import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * cart_items: дедупликация + UNIQUE INDEX (cartId, variantId)
 *
 * Контекст: до этой миграции `cart_items` имел только @Index на cartId.
 * При параллельных POST /cart/items с одним variantId оба запроса проходили
 * findItemByCartAndVariant (не найдено) → оба делали createItem → дубль.
 * Это ломало React (одинаковые keys) и не позволяло удалить дубль через
 * UI (cart.service.ts find(item => item.variantId === ...) брал только первый).
 *
 * up:
 *   1. Дедупликация: для каждой пары (cartId, variantId) суммируем quantity
 *      в самую новую запись (max createdAt), удаляем остальные.
 *   2. UNIQUE INDEX(cartId, variantId) — гарантия от будущих race conditions.
 *
 * Идемпотентно: IF NOT EXISTS для index, дедупликация безопасна на нулевых дублях.
 */
export class AddCartItemsUniqueIndex1777020228547 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Consolidate quantities в самую новую запись (выживает та, что с max createdAt)
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          "cartId",
          "variantId",
          quantity,
          row_number() OVER (
            PARTITION BY "cartId", "variantId"
            ORDER BY "createdAt" DESC, id DESC
          ) AS rn,
          SUM(quantity) OVER (PARTITION BY "cartId", "variantId") AS total_qty
        FROM cart_items
      )
      UPDATE cart_items ci
      SET quantity = LEAST(ranked.total_qty, 10)
      FROM ranked
      WHERE ci.id = ranked.id AND ranked.rn = 1
    `);

    // 2. Удаляем все, кроме победителей
    await queryRunner.query(`
      DELETE FROM cart_items
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            row_number() OVER (
              PARTITION BY "cartId", "variantId"
              ORDER BY "createdAt" DESC, id DESC
            ) AS rn
          FROM cart_items
        ) ranked
        WHERE rn > 1
      )
    `);

    // 3. Уникальный индекс
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_variant_uniq"
      ON cart_items ("cartId", "variantId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "cart_items_cart_variant_uniq"`,
    );
    // Дедупликацию не откатываем — это потеря данных не лечится.
  }
}
