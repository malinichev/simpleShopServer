import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings, NotificationSettings, SocialLinks } from './entities/settings.entity';
import { ShippingMethod } from './entities/shipping-method.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import {
  UpdateSettingsDto,
  CreateShippingMethodDto,
  UpdateShippingMethodDto,
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepository: Repository<Settings>,
    @InjectRepository(ShippingMethod)
    private readonly shippingRepository: Repository<ShippingMethod>,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepository: Repository<PaymentMethod>,
  ) {}

  // ======================== Settings (singleton) ========================

  private readonly defaultNotifications: NotificationSettings = {
    newOrder: true,
    statusChange: true,
    paymentReceived: true,
    newReview: false,
    customerRegistration: false,
    lowStock: true,
    refundRequest: true,
  };

  async getSettings(): Promise<Settings> {
    const existing = await this.settingsRepository.find();
    if (existing.length > 0) {
      const settings = existing[0];
      settings.notifications =
        settings.notifications ?? this.defaultNotifications;
      settings.notificationEmail =
        settings.notificationEmail ?? 'admin@sportshop.ru';
      return settings;
    }

    const defaults = this.settingsRepository.create({
      storeName: 'SportShop',
      email: 'admin@sportshop.ru',
      phone: '+7 (999) 123-45-67',
      address: 'Москва, ул. Примерная, д. 1',
      currency: 'RUB',
      language: 'ru',
      notifications: this.defaultNotifications,
      notificationEmail: 'admin@sportshop.ru',
    });

    return this.settingsRepository.save(defaults);
  }

  async getPublicSettings() {
    const s = await this.getSettings();
    return {
      storeName: s.storeName,
      description: s.description ?? '',
      email: s.email,
      phone: s.phone,
      address: s.address,
      currency: s.currency,
      socialLinks: s.socialLinks ?? {},
    };
  }

  async findActiveShippingMethods(): Promise<ShippingMethod[]> {
    return this.shippingRepository.find({
      where: { isActive: true },
      order: { order: 'ASC' },
    });
  }

  async findActivePaymentMethods(): Promise<PaymentMethod[]> {
    return this.paymentRepository.find({
      where: { isActive: true },
      order: { order: 'ASC' },
    });
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<Settings> {
    const settings = await this.getSettings();

    if (dto.notifications) {
      dto.notifications = { ...settings.notifications, ...dto.notifications };
    }

    await this.settingsRepository.update(settings.id, dto);

    return this.getSettings();
  }

  // ======================== Shipping Methods ========================

  async findAllShippingMethods(): Promise<ShippingMethod[]> {
    return this.shippingRepository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  async createShippingMethod(
    dto: CreateShippingMethodDto,
  ): Promise<ShippingMethod> {
    const method = this.shippingRepository.create(dto);
    return this.shippingRepository.save(method);
  }

  async updateShippingMethod(
    id: string,
    dto: UpdateShippingMethodDto,
  ): Promise<ShippingMethod> {
    const method = await this.shippingRepository.findOne({
      where: { id },
    });

    if (!method) {
      throw new NotFoundException('Способ доставки не найден');
    }

    await this.shippingRepository.update(id, dto);

    const updated = await this.shippingRepository.findOne({
      where: { id },
    });

    return updated!;
  }

  async deleteShippingMethod(id: string): Promise<void> {
    const method = await this.shippingRepository.findOne({
      where: { id },
    });

    if (!method) {
      throw new NotFoundException('Способ доставки не найден');
    }

    await this.shippingRepository.delete(id);
  }

  // ======================== Payment Methods ========================

  async findAllPaymentMethods(): Promise<PaymentMethod[]> {
    return this.paymentRepository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  async createPaymentMethod(
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const method = this.paymentRepository.create(dto);
    return this.paymentRepository.save(method);
  }

  async updatePaymentMethod(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const method = await this.paymentRepository.findOne({
      where: { id },
    });

    if (!method) {
      throw new NotFoundException('Способ оплаты не найден');
    }

    await this.paymentRepository.update(id, dto);

    const updated = await this.paymentRepository.findOne({
      where: { id },
    });

    return updated!;
  }

  async deletePaymentMethod(id: string): Promise<void> {
    const method = await this.paymentRepository.findOne({
      where: { id },
    });

    if (!method) {
      throw new NotFoundException('Способ оплаты не найден');
    }

    await this.paymentRepository.delete(id);
  }
}
