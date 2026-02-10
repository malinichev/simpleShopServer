import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailModule } from '@/modules/mail/mail.module';
import { EmailProcessor } from './processors/email.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'image-processing' },
      { name: 'analytics' },
    ),
    MailModule,
  ],
  providers: [EmailProcessor, AnalyticsProcessor],
  exports: [BullModule],
})
export class JobsModule {}
