import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Settings, NotificationSettings } from './entities/settings.entity';
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
      settings.notifications = settings.notifications ?? this.defaultNotifications;
      settings.notificationEmail = settings.notificationEmail ?? 'admin@sportshop.ru';
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

  async updateSettings(dto: UpdateSettingsDto): Promise<Settings> {
    const settings = await this.getSettings();

    if (dto.notifications) {
      dto.notifications = { ...settings.notifications, ...dto.notifications };
    }

    await this.settingsRepository.update(
      { _id: settings._id } as Record<string, unknown>,
      dto,
    );

    return this.getSettings();
  }

  // ======================== Shipping Methods ========================

  async findAllShippingMethods(): Promise<ShippingMethod[]> {
    return this.shippingRepository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  async createShippingMethod(dto: CreateShippingMethodDto): Promise<ShippingMethod> {
    const method = this.shippingRepository.create(dto);
    return this.shippingRepository.save(method);
  }

  async updateShippingMethod(
    id: string,
    dto: UpdateShippingMethodDto,
  ): Promise<ShippingMethod> {
    const objectId = new ObjectId(id);
    const method = await this.shippingRepository.findOne({
      where: { _id: objectId } as Record<string, unknown>,
    });

    if (!method) {
      throw new NotFoundException('Способ доставки не найден');
    }

    await this.shippingRepository.update(
      { _id: objectId } as Record<string, unknown>,
      dto,
    );

    const updated = await this.shippingRepository.findOne({
      where: { _id: objectId } as Record<string, unknown>,
    });

    return updated!;
  }

  async deleteShippingMethod(id: string): Promise<void> {
    const objectId = new ObjectId(id);
    const method = await this.shippingRepository.findOne({
      where: { _id: objectId } as Record<string, unknown>,
    });

    if (!method) {
      throw new NotFoundException('Способ доставки не найден');
    }

    await this.shippingRepository.delete({
      _id: objectId,
    } as Record<string, unknown>);
  }

  // ======================== Payment Methods ========================

  async findAllPaymentMethods(): Promise<PaymentMethod[]> {
    return this.paymentRepository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  async createPaymentMethod(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const method = this.paymentRepository.create(dto);
    return this.paymentRepository.save(method);
  }

  async updatePaymentMethod(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const objectId = new ObjectId(id);
    const method = await this.paymentRepository.findOne({
      where: { _id: objectId } as Record<string, unknown>,
    });

    if (!method) {
      throw new NotFoundException('Способ оплаты не найден');
    }

    await this.paymentRepository.update(
      { _id: objectId } as Record<string, unknown>,
      dto,
    );

    const updated = await this.paymentRepository.findOne({
      where: { _id: objectId } as Record<string, unknown>,
    });

    return updated!;
  }

  async deletePaymentMethod(id: string): Promise<void> {
    const objectId = new ObjectId(id);
    const method = await this.paymentRepository.findOne({
      where: { _id: objectId } as Record<string, unknown>,
    });

    if (!method) {
      throw new NotFoundException('Способ оплаты не найден');
    }

    await this.paymentRepository.delete({
      _id: objectId,
    } as Record<string, unknown>);
  }
}
