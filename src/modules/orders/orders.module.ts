import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { OrderMarkingService } from './order-marking.service';
import { OrdersController } from './orders.controller';
import { CartModule } from '@/modules/cart/cart.module';
import { ProductsModule } from '@/modules/products/products.module';
import { PromotionsModule } from '@/modules/promotions/promotions.module';
import { UsersModule } from '@/modules/users/users.module';
import { MarkingModule } from '@/modules/marking/marking.module';
import { MailModule } from '@/modules/mail/mail.module';
import { MarkingCode } from '@/modules/marking/entities/marking-code.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Order, OrderItemEntity, MarkingCode]),
    CartModule,
    ProductsModule,
    PromotionsModule,
    MarkingModule,
    MailModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService, OrderMarkingService],
  exports: [OrdersService, OrderMarkingService],
})
export class OrdersModule {}
