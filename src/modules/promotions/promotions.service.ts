import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { PromotionsRepository } from './promotions.repository';
import { Promotion, PromotionType } from './entities/promotion.entity';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  CartValidationData,
  CartItemDto,
  PromotionValidation,
} from './dto';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly promotionsRepository: PromotionsRepository,
  ) {}

  async findAll(): Promise<Promotion[]> {
    return this.promotionsRepository.findAll();
  }

  async findById(id: string): Promise<Promotion> {
    const promotion = await this.promotionsRepository.findById(id);
    if (!promotion) {
      throw new NotFoundException('Промокод не найден');
    }
    return promotion;
  }

  async findByCode(code: string): Promise<Promotion | null> {
    return this.promotionsRepository.findByCode(code);
  }

  async create(dto: CreatePromotionDto): Promise<Promotion> {
    const code = dto.code.toUpperCase();

    const existing = await this.promotionsRepository.findByCode(code);
    if (existing) {
      throw new ConflictException(`Промокод "${code}" уже существует`);
    }

    if (dto.type === PromotionType.PERCENTAGE && dto.value > 100) {
      throw new BadRequestException('Процент скидки не может быть больше 100');
    }

    const promotionData: Partial<Promotion> = {
      code,
      name: dto.name,
      description: dto.description,
      type: dto.type,
      value: dto.value,
      minOrderAmount: dto.minOrderAmount,
      maxDiscount: dto.maxDiscount,
      usageLimit: dto.usageLimit,
      usageLimitPerUser: dto.usageLimitPerUser,
      usedCount: 0,
      categoryIds: (dto.categoryIds || []).map((id) => new ObjectId(id)),
      productIds: (dto.productIds || []).map((id) => new ObjectId(id)),
      excludeProductIds: (dto.excludeProductIds || []).map((id) => new ObjectId(id)),
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      isActive: dto.isActive ?? true,
      userUsage: {},
    };

    return this.promotionsRepository.create(promotionData);
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<Promotion> {
    const promotion = await this.findById(id);

    if (dto.code) {
      const code = dto.code.toUpperCase();
      const existing = await this.promotionsRepository.findByCode(code);
      if (existing && existing._id.toString() !== id) {
        throw new ConflictException(`Промокод "${code}" уже существует`);
      }
    }

    if (
      (dto.type ?? promotion.type) === PromotionType.PERCENTAGE &&
      (dto.value ?? promotion.value) > 100
    ) {
      throw new BadRequestException('Процент скидки не может быть больше 100');
    }

    const updateData: Partial<Promotion> = {};

    if (dto.code !== undefined) updateData.code = dto.code.toUpperCase();
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.value !== undefined) updateData.value = dto.value;
    if (dto.minOrderAmount !== undefined) updateData.minOrderAmount = dto.minOrderAmount;
    if (dto.maxDiscount !== undefined) updateData.maxDiscount = dto.maxDiscount;
    if (dto.usageLimit !== undefined) updateData.usageLimit = dto.usageLimit;
    if (dto.usageLimitPerUser !== undefined) updateData.usageLimitPerUser = dto.usageLimitPerUser;
    if (dto.categoryIds !== undefined) {
      updateData.categoryIds = dto.categoryIds.map((cid) => new ObjectId(cid));
    }
    if (dto.productIds !== undefined) {
      updateData.productIds = dto.productIds.map((pid) => new ObjectId(pid));
    }
    if (dto.excludeProductIds !== undefined) {
      updateData.excludeProductIds = dto.excludeProductIds.map((pid) => new ObjectId(pid));
    }
    if (dto.startDate !== undefined) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.promotionsRepository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException('Промокод не найден');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.promotionsRepository.delete(id);
  }

  async validate(
    code: string,
    userId: string | null,
    cart: CartValidationData,
  ): Promise<PromotionValidation> {
    const promotion = await this.promotionsRepository.findByCode(code);
    if (!promotion) {
      return { valid: false, discount: 0, message: 'Промокод не найден' };
    }

    if (!promotion.isActive) {
      return { valid: false, discount: 0, message: 'Промокод неактивен' };
    }

    const now = new Date();
    if (now < promotion.startDate) {
      return { valid: false, discount: 0, message: 'Промокод ещё не активен' };
    }
    if (now > promotion.endDate) {
      return { valid: false, discount: 0, message: 'Срок действия промокода истёк' };
    }

    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
      return { valid: false, discount: 0, message: 'Лимит использований промокода исчерпан' };
    }

    if (userId && promotion.usageLimitPerUser) {
      const userUses = promotion.userUsage[userId] || 0;
      if (userUses >= promotion.usageLimitPerUser) {
        return {
          valid: false,
          discount: 0,
          message: 'Вы уже использовали этот промокод максимальное количество раз',
        };
      }
    }

    if (promotion.minOrderAmount && cart.cartTotal < promotion.minOrderAmount) {
      return {
        valid: false,
        discount: 0,
        message: `Минимальная сумма заказа для этого промокода: ${promotion.minOrderAmount}`,
      };
    }

    const applicableItems = this.getApplicableItems(promotion, cart.items);
    if (applicableItems.length === 0 && (promotion.categoryIds.length > 0 || promotion.productIds.length > 0)) {
      return {
        valid: false,
        discount: 0,
        message: 'Промокод не применим к товарам в корзине',
      };
    }

    const discount = this.calculateDiscount(promotion, applicableItems);

    return {
      valid: true,
      discount,
      type: promotion.type,
    };
  }

  async applyUsage(code: string, userId?: string): Promise<void> {
    const promotion = await this.promotionsRepository.findByCode(code);
    if (!promotion) {
      throw new NotFoundException('Промокод не найден');
    }

    const newUsedCount = promotion.usedCount + 1;
    const newUserUsage = { ...promotion.userUsage };

    if (userId) {
      newUserUsage[userId] = (newUserUsage[userId] || 0) + 1;
    }

    await this.promotionsRepository.incrementUsage(
      promotion._id,
      newUsedCount,
      newUserUsage,
    );
  }

  calculateDiscount(promotion: Promotion, items: CartItemDto[]): number {
    if (promotion.type === PromotionType.FREE_SHIPPING) {
      return 0;
    }

    const itemsTotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    let discount: number;

    if (promotion.type === PromotionType.PERCENTAGE) {
      discount = (itemsTotal * promotion.value) / 100;
      if (promotion.maxDiscount && discount > promotion.maxDiscount) {
        discount = promotion.maxDiscount;
      }
    } else {
      discount = Math.min(promotion.value, itemsTotal);
    }

    return Math.round(discount * 100) / 100;
  }

  private getApplicableItems(
    promotion: Promotion,
    items: CartItemDto[],
  ): CartItemDto[] {
    let applicable = [...items];

    if (promotion.excludeProductIds.length > 0) {
      const excludeIds = promotion.excludeProductIds.map((id) => id.toString());
      applicable = applicable.filter(
        (item) => !excludeIds.includes(item.productId),
      );
    }

    if (promotion.productIds.length > 0) {
      const productIds = promotion.productIds.map((id) => id.toString());
      applicable = applicable.filter((item) =>
        productIds.includes(item.productId),
      );
    } else if (promotion.categoryIds.length > 0) {
      const categoryIds = promotion.categoryIds.map((id) => id.toString());
      applicable = applicable.filter(
        (item) => item.categoryId && categoryIds.includes(item.categoryId),
      );
    }

    return applicable;
  }
}
