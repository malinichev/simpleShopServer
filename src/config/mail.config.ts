import { registerAs } from '@nestjs/config';

const brandName = process.env.BRAND_NAME || 'My Shop';

export default registerAs('mail', () => ({
  /** Driver: 'smtp' (default) | 'resend' | 'console' (no real delivery, dev only) */
  driver: process.env.MAIL_DRIVER || 'smtp',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || `"${brandName}" <noreply@example.com>`,
  resendApiKey: process.env.RESEND_API_KEY || '',
}));
