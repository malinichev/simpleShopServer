export interface MailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Абстракция отправки писем. Реализации:
 *   - SmtpMailDriver — nodemailer (default, ставится при `MAIL_DRIVER=smtp` или пусто)
 *   - ResendMailDriver — HTTPS POST к api.resend.com
 *   - ConsoleMailDriver — log-only, для dev/template-первого-запуска без SMTP
 *
 * Добавление нового драйвера: реализовать интерфейс + добавить case
 * в createMailDriver factory (drivers/index.ts).
 */
export interface MailDriver {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_DRIVER = Symbol('MAIL_DRIVER');
