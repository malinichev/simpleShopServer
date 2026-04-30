import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  MarkingCode,
  MarkingCodeStatus,
} from '@/modules/marking/entities/marking-code.entity';
import { MarkingService } from '@/modules/marking/marking.service';
import { OrderItemEntity } from './entities/order-item.entity';

export interface MarkingAssignmentResult {
  fullyAssigned: boolean;
  items: Array<{ variantId: string; requested: number; assigned: number }>;
}

@Injectable()
export class OrderMarkingService {
  private readonly logger = new Logger(OrderMarkingService.name);

  constructor(
    @InjectRepository(MarkingCode)
    private readonly markingRepo: Repository<MarkingCode>,
    private readonly markingService: MarkingService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Резервирует коды маркировки для позиций заказа.
   * Использует FOR UPDATE SKIP LOCKED для предотвращения гонок.
   * Мутирует items — заполняет markingCodes и markingCodesAssigned.
   */
  async reserveCodesForOrder(
    orderId: string,
    items: OrderItemEntity[],
  ): Promise<MarkingAssignmentResult> {
    const result: MarkingAssignmentResult = { fullyAssigned: true, items: [] };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        // SELECT ... FOR UPDATE SKIP LOCKED — пессимистичная блокировка
        const codes: MarkingCode[] = await queryRunner.query(
          `SELECT * FROM marking_codes
           WHERE "variantId" = $1 AND status = $2
           ORDER BY "createdAt" ASC
           LIMIT $3
           FOR UPDATE SKIP LOCKED`,
          [item.variantId, MarkingCodeStatus.IN_STOCK, item.quantity],
        );

        if (codes.length > 0) {
          const codeIds = codes.map((c) => c.id);
          await queryRunner.query(
            `UPDATE marking_codes
             SET status = $1, "orderId" = $2, "statusChangedAt" = NOW()
             WHERE id = ANY($3)`,
            [MarkingCodeStatus.RESERVED, orderId, codeIds],
          );
        }

        item.markingCodes = codes.map((c) => ({
          id: c.id,
          code: c.code,
          gtin: c.gtin,
          serial: c.serial,
        }));
        item.markingCodesAssigned = codes.length === item.quantity;

        if (!item.markingCodesAssigned) {
          result.fullyAssigned = false;
        }

        result.items.push({
          variantId: item.variantId,
          requested: item.quantity,
          assigned: codes.length,
        });
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Синхронизировать stock вариантов после резервирования
    const variantIds = [...new Set(items.map((i) => i.variantId))];
    for (const vid of variantIds) {
      await this.markingService.syncVariantStock(vid);
    }

    return result;
  }

  /**
   * Переводит коды маркировки заказа в новый статус.
   * При переходе в IN_STOCK очищает orderId.
   */
  async transitionCodes(
    orderId: string,
    toStatus: MarkingCodeStatus,
    fromStatuses?: MarkingCodeStatus[],
  ): Promise<number> {
    const clearOrderId = toStatus === MarkingCodeStatus.IN_STOCK;

    let query = `
      UPDATE marking_codes
      SET status = $1,
          "statusChangedAt" = NOW()
          ${clearOrderId ? ', "orderId" = NULL' : ''}
      WHERE "orderId" = $2
    `;
    const params: any[] = [toStatus, orderId];

    if (fromStatuses?.length) {
      query += ` AND status = ANY($3)`;
      params.push(fromStatuses);
    }

    const result = await this.markingRepo.query(query, params);
    const affected = result?.[1] ?? 0;

    this.logger.log(
      `Transition ${affected} codes for order ${orderId} → ${toStatus}`,
    );

    // Синхронизировать stock затронутых вариантов
    if (affected > 0) {
      const codes = await this.markingRepo.find({
        where: { orderId },
        select: ['variantId'],
      });
      const variantIds = [...new Set(codes.map((c) => c.variantId))];
      for (const vid of variantIds) {
        await this.markingService.syncVariantStock(vid);
      }
    }

    return affected;
  }

  /**
   * Возвращает все коды маркировки, привязанные к заказу.
   */
  async getCodesForOrder(orderId: string): Promise<MarkingCode[]> {
    return this.markingRepo.find({
      where: { orderId },
      relations: ['variant'],
      order: { createdAt: 'ASC' },
    });
  }
}
