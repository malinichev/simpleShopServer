import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export interface SocialLinks {
  instagram?: string;
  telegram?: string;
  vk?: string;
}

export interface NotificationSettings {
  newOrder: boolean;
  statusChange: boolean;
  paymentReceived: boolean;
  newReview: boolean;
  customerRegistration: boolean;
  lowStock: boolean;
  refundRequest: boolean;
}

@Entity('settings')
export class Settings extends BaseEntity {
  @Column({ default: 'SportShop' })
  storeName: string;

  @Column({ default: 'admin@sportshop.ru' })
  email: string;

  @Column({ default: '' })
  phone: string;

  @Column({ default: '' })
  address: string;

  @Column({ default: 'RUB' })
  currency: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: 'ru' })
  language: string;

  @Column('jsonb', { default: {} })
  socialLinks: SocialLinks;

  @Column('jsonb', {
    default: {
      newOrder: true,
      statusChange: true,
      paymentReceived: true,
      newReview: false,
      customerRegistration: false,
      lowStock: true,
      refundRequest: true,
    },
  })
  notifications: NotificationSettings;

  @Column({ default: 'admin@sportshop.ru' })
  notificationEmail: string;
}
