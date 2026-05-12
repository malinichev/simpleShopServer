import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethod } from '@/modules/settings/entities/payment-method.entity';
import { OrdersModule } from '@/modules/orders/orders.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import {
  PAYMENT_DRIVERS,
  createPaymentDrivers,
} from './drivers';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PaymentMethod]),
    forwardRef(() => OrdersModule),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_DRIVERS,
      useFactory: (configService: ConfigService) =>
        createPaymentDrivers(configService),
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
