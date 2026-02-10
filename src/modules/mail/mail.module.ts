import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
