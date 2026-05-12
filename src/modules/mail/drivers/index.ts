import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailDriver } from './mail-driver.interface';
import { SmtpMailDriver } from './smtp.driver';
import { ResendMailDriver } from './resend.driver';
import { ConsoleMailDriver } from './console.driver';

export type MailDriverName = 'smtp' | 'resend' | 'console';

/**
 * Factory выбора mail-driver по env `MAIL_DRIVER`.
 * Default — `smtp` (текущее поведение SVOYA).
 */
export function createMailDriver(configService: ConfigService): MailDriver {
  const logger = new Logger('MailDriverFactory');
  const driverName = (
    configService.get<string>('mail.driver') || 'smtp'
  ).toLowerCase() as MailDriverName;

  switch (driverName) {
    case 'resend':
      logger.log('Mail driver: Resend (HTTPS API)');
      return new ResendMailDriver(configService);
    case 'console':
      logger.log('Mail driver: Console (no real delivery)');
      return new ConsoleMailDriver();
    case 'smtp':
    default:
      logger.log('Mail driver: SMTP (nodemailer)');
      return new SmtpMailDriver(configService);
  }
}

export type { MailDriver, MailMessage } from './mail-driver.interface';
export { MAIL_DRIVER } from './mail-driver.interface';
