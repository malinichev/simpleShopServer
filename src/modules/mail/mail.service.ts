import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MAIL_DRIVER, MailDriver } from './drivers';

export interface WelcomeEmailData {
  firstName: string;
  shopUrl: string;
}

export interface OrderConfirmationData {
  firstName: string;
  orderNumber: string;
  orderDate: string;
  items: Array<{
    name: string;
    size?: string;
    color?: string;
    quantity: number;
    total: number;
  }>;
  subtotal: number;
  discount?: number;
  shipping: number;
  total: number;
  shippingAddress: string;
  orderUrl: string;
}

export interface OrderStatusData {
  firstName: string;
  orderNumber: string;
  statusLabel: string;
  comment?: string;
  orderUrl: string;
}

export interface PasswordResetData {
  firstName: string;
  resetUrl: string;
  expiresIn: string;
}

export interface EmailVerificationData {
  firstName: string;
  verificationUrl: string;
}

export interface EmailChangeVerificationData {
  firstName: string;
  verificationUrl: string;
  expiresIn: string;
}

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();
  private readonly templatesDir = join(__dirname, 'templates');
  private readonly brandName: string;
  private readonly queueEnabled: boolean;

  constructor(
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly configService: ConfigService,
    @Inject(MAIL_DRIVER) private readonly mailDriver: MailDriver,
  ) {
    this.brandName = this.configService.get<string>('brandName') || 'My Shop';
    // Если REDIS_HOST не задан — Redis недоступен, BullMQ работать не будет.
    // Переключаемся в синхронный режим: MailDriver вызывается напрямую.
    const redisHost = this.configService.get<string>('redis.host');
    this.queueEnabled = !!redisHost && redisHost.trim() !== '';
    if (!this.queueEnabled) {
      this.logger.warn(
        'REDIS_HOST не задан → email отправляется синхронно, без очереди и retry. Для prod рекомендуется поднять Redis.',
      );
    }
  }

  async sendWelcome(to: string, data: WelcomeEmailData): Promise<void> {
    await this.addEmailJob(
      to,
      `Добро пожаловать в ${this.brandName}!`,
      'welcome',
      { ...data },
    );
  }

  async sendOrderConfirmation(
    to: string,
    data: OrderConfirmationData,
  ): Promise<void> {
    await this.addEmailJob(
      to,
      `Заказ ${data.orderNumber} подтверждён`,
      'order-confirmation',
      { ...data },
    );
  }

  async sendOrderStatusUpdate(
    to: string,
    data: OrderStatusData,
  ): Promise<void> {
    await this.addEmailJob(
      to,
      `Статус заказа ${data.orderNumber} обновлён`,
      'order-status-update',
      { ...data },
    );
  }

  async sendPasswordReset(to: string, data: PasswordResetData): Promise<void> {
    await this.addEmailJob(
      to,
      `Сброс пароля — ${this.brandName}`,
      'password-reset',
      { ...data },
    );
  }

  async sendEmailVerification(
    to: string,
    data: EmailVerificationData,
  ): Promise<void> {
    await this.addEmailJob(
      to,
      `Подтвердите ваш email — ${this.brandName}`,
      'email-verification',
      { ...data },
    );
  }

  async sendEmailChangeVerification(
    to: string,
    data: EmailChangeVerificationData,
  ): Promise<void> {
    await this.addEmailJob(
      to,
      `Подтвердите новый email — ${this.brandName}`,
      'email-change-verification',
      { ...data },
    );
  }

  compileTemplate(templateName: string, data: Record<string, unknown>): string {
    let template = this.templates.get(templateName);

    if (!template) {
      const filePath = join(this.templatesDir, `${templateName}.hbs`);
      const source = readFileSync(filePath, 'utf-8');
      template = Handlebars.compile(source);
      this.templates.set(templateName, template);
    }

    return template({
      ...data,
      year: new Date().getFullYear(),
      brandName: this.brandName,
    });
  }

  private async addEmailJob(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    if (!this.queueEnabled) {
      // Sync fallback: рендерим и шлём напрямую, без BullMQ/Redis.
      const html = this.compileTemplate(template, context);
      const from = this.configService.get<string>('mail.from') || '';
      try {
        await this.mailDriver.send({ from, to, subject, html });
        this.logger.log(`Email sent (sync): ${template} -> ${to}`);
      } catch (err) {
        // Без очереди нет retry — логируем и пропускаем.
        // Не throw'им, чтобы не блокировать основной flow (регистрация, заказ).
        this.logger.error(
          `Email failed (sync, no retry): ${template} -> ${to}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    const job = await this.emailQueue.add(
      'send-email',
      { to, subject, template, context } as EmailJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    this.logger.log(`Email job ${job.id} added: ${template} -> ${to}`);
  }
}
