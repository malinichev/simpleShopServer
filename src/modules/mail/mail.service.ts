import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  constructor(
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  async sendWelcome(to: string, data: WelcomeEmailData): Promise<void> {
    await this.addEmailJob(to, 'Добро пожаловать в SportShop!', 'welcome', { ...data });
  }

  async sendOrderConfirmation(to: string, data: OrderConfirmationData): Promise<void> {
    await this.addEmailJob(to, `Заказ ${data.orderNumber} подтверждён`, 'order-confirmation', { ...data });
  }

  async sendOrderStatusUpdate(to: string, data: OrderStatusData): Promise<void> {
    await this.addEmailJob(to, `Статус заказа ${data.orderNumber} обновлён`, 'order-status-update', { ...data });
  }

  async sendPasswordReset(to: string, data: PasswordResetData): Promise<void> {
    await this.addEmailJob(to, 'Сброс пароля — SportShop', 'password-reset', { ...data });
  }

  async sendEmailVerification(to: string, data: EmailVerificationData): Promise<void> {
    await this.addEmailJob(to, 'Подтвердите ваш email — SportShop', 'email-verification', { ...data });
  }

  compileTemplate(templateName: string, data: Record<string, unknown>): string {
    let template = this.templates.get(templateName);

    if (!template) {
      const filePath = join(this.templatesDir, `${templateName}.hbs`);
      const source = readFileSync(filePath, 'utf-8');
      template = Handlebars.compile(source);
      this.templates.set(templateName, template);
    }

    return template({ ...data, year: new Date().getFullYear() });
  }

  private async addEmailJob(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void> {
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
