import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { MailService, EmailJobData } from '@/modules/mail/mail.service';
import { MAIL_DRIVER, MailDriver } from '@/modules/mail/drivers';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @Inject(MAIL_DRIVER) private readonly mailDriver: MailDriver,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { to, subject, template, context } = job.data;
    this.logger.log(`Processing email job ${job.id}: ${template} -> ${to}`);

    try {
      const html = this.mailService.compileTemplate(template, context);
      const from = this.configService.get<string>('mail.from') || '';

      await this.mailDriver.send({ from, to, subject, html });

      this.logger.log(`Email job ${job.id} completed: ${template} -> ${to}`);
    } catch (error) {
      this.logger.error(
        `Email job ${job.id} failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts}): ${error}`,
      );
      throw error;
    }
  }
}
