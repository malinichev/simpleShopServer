import { Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailDriver, MailMessage } from './mail-driver.interface';

/**
 * Resend driver через HTTPS API (https://resend.com).
 * Не требует SDK — обычный fetch. Активируется при MAIL_DRIVER=resend.
 *
 * env: RESEND_API_KEY (обязательно если выбран driver).
 */
export class ResendMailDriver implements MailDriver {
  private readonly logger = new Logger(ResendMailDriver.name);
  private readonly apiKey: string;
  private readonly endpoint = 'https://api.resend.com/emails';

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('mail.resendApiKey') || '';
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY не задан. Установите переменную или смените MAIL_DRIVER на smtp/console.',
      );
    }
    this.apiKey = apiKey;
  }

  async send(message: MailMessage): Promise<void> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      this.logger.error(`Resend API ${res.status}: ${body}`);
      throw new InternalServerErrorException(
        `Resend API error: ${res.status}`,
      );
    }

    this.logger.debug(`Resend sent: ${message.subject} → ${message.to}`);
  }
}
