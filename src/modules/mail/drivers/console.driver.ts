import { Logger } from '@nestjs/common';
import type { MailDriver, MailMessage } from './mail-driver.interface';

/**
 * Console-driver — печатает письма в логи без реальной отправки.
 *
 * Назначение: dev/staging-окружения и first-launch шаблона до настройки SMTP.
 * Для prod НЕ использовать — клиенты не получат подтверждения заказов и т.д.
 *
 * Активируется при MAIL_DRIVER=console.
 */
export class ConsoleMailDriver implements MailDriver {
  private readonly logger = new Logger(ConsoleMailDriver.name);

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      `📧 [console mail] ${message.subject} → ${message.to} (from: ${message.from})`,
    );
    this.logger.debug(
      `HTML body (first 200 chars): ${message.html.slice(0, 200)}`,
    );
    return Promise.resolve();
  }
}
