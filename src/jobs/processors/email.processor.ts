import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createTransport, Transporter } from 'nodemailer';
import { MailService, EmailJobData } from '@/modules/mail/mail.service';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly transporter: Transporter;

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    super();

    const port = this.configService.get<number>('mail.port');
    /**
     * `family: 4` — принудительно IPv4. У mail.ru/yandex SMTP в DNS лежит IPv6,
     * который часто недоступен с домашних сетей → EHOSTUNREACH. Опция
     * не торчит в TS-типах nodemailer верхнего уровня, поэтому каст.
     */
    const transportOptions: Record<string, unknown> = {
      host: this.configService.get<string>('mail.host'),
      port,
      secure: port === 465,
      family: 4,
      auth: {
        user: this.configService.get<string>('mail.user'),
        pass: this.configService.get<string>('mail.pass'),
      },
    };
    this.transporter = createTransport(
      transportOptions as Parameters<typeof createTransport>[0],
    );
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject, template, context } = job.data;
    this.logger.log(`Processing email job ${job.id}: ${template} -> ${to}`);

    try {
      const html = this.mailService.compileTemplate(template, context);

      await this.transporter.sendMail({
        from: this.configService.get<string>('mail.from'),
        to,
        subject,
        html,
      });

      this.logger.log(`Email job ${job.id} completed: ${template} -> ${to}`);
    } catch (error) {
      this.logger.error(
        `Email job ${job.id} failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts}): ${error}`,
      );
      throw error;
    }
  }
}
