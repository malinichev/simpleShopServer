import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { createMailDriver, MAIL_DRIVER } from './drivers';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  providers: [
    MailService,
    {
      provide: MAIL_DRIVER,
      useFactory: (configService: ConfigService) => createMailDriver(configService),
      inject: [ConfigService],
    },
  ],
  exports: [MailService, MAIL_DRIVER],
})
export class MailModule {}
