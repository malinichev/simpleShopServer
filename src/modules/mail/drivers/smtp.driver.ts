import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { MailDriver, MailMessage } from './mail-driver.interface';

/**
 * SMTP-driver через nodemailer. Default-выбор при отсутствии MAIL_DRIVER env.
 *
 * `family: 4` — принудительный IPv4. У mail.ru/yandex SMTP в DNS лежит IPv6,
 * который часто недоступен из домашних сетей → EHOSTUNREACH.
 */
export class SmtpMailDriver implements MailDriver {
  private readonly logger = new Logger(SmtpMailDriver.name);
  private readonly transporter: Transporter;

  constructor(configService: ConfigService) {
    const port = configService.get<number>('mail.port');
    const transportOptions: Record<string, unknown> = {
      host: configService.get<string>('mail.host'),
      port,
      secure: port === 465,
      family: 4,
      auth: {
        user: configService.get<string>('mail.user'),
        pass: configService.get<string>('mail.pass'),
      },
    };
    this.transporter = createTransport(
      transportOptions as Parameters<typeof createTransport>[0],
    );
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    this.logger.debug(`SMTP sent: ${message.subject} → ${message.to}`);
  }
}
