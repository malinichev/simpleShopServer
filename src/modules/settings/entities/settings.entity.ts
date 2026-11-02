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

/** Пресет сцены для диалога ИИ-генерации фото (чипы в админке). */
export interface AiPromptPreset {
  id: string;
  title: string;
  prompt: string;
}

/** Базовый промпт стиля + пресеты сцен (docs/PRODUCT_PHOTO_STYLE.md). */
export interface AiImagePrompts {
  basePrompt: string;
  presets: AiPromptPreset[];
}

/**
 * Дефолтные промпты — [BASE STYLE] секция гайда PRODUCT_PHOTO_STYLE.md.
 * Редактируются в настройках админки; миграция сеет это же значение.
 */
export const DEFAULT_AI_IMAGE_PROMPTS: AiImagePrompts = {
  basePrompt:
    'Professional e-commerce lifestyle photography for SVOY BRAND, a women\'s homewear and sportswear label. ' +
    'Natural-looking female model in her late 20s to mid 30s, soft natural beauty, relaxed cozy mood at home. ' +
    'Soft warm natural light (morning sun or warm evening lamp), modern cozy interior — bedroom, bathroom or kitchen. ' +
    'Warm light palette, gentle cream tones, editorial fashion quality, the garment is the hero of the shot, ' +
    'sharp focus, clean uncluttered composition.',
  presets: [
    {
      id: 'tea-before-sleep',
      title: 'Чай перед сном',
      prompt:
        'Evening wind-down: the model sits in a cozy bedroom holding a cup of herbal tea, warm lamp light, ' +
        'soft blanket nearby, calm bedtime mood.',
    },
    {
      id: 'morning-home',
      title: 'Утро дома',
      prompt:
        'Fresh morning at home: the model stretches near a window with sheer curtains, sunlight on wooden floor, ' +
        'light and airy start-of-the-day mood.',
    },
    {
      id: 'yoga-home',
      title: 'Йога дома',
      prompt:
        'Home yoga session: the model does a gentle stretch on a mat in a bright living room, calm and focused, ' +
        'minimal props, breathing-room composition.',
    },
    {
      id: 'bath-spa',
      title: 'Ванная / спа',
      prompt:
        'Spa mood: the model by a mirror in a light bathroom, soft towels and skincare on the shelf, ' +
        'fresh clean atmosphere, steam-warm light.',
    },
  ],
};

@Entity('settings')
export class Settings extends BaseEntity {
  @Column({ default: '' })
  storeName: string;

  @Column({ default: '' })
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

  @Column({ default: '' })
  notificationEmail: string;

  @Column('jsonb', { default: DEFAULT_AI_IMAGE_PROMPTS })
  aiImagePrompts: AiImagePrompts;
}
