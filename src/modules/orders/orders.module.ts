import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CartModule } from '@/modules/cart/cart.module';
import { ProductsModule } from '@/modules/products/products.module';
import { PromotionsModule } from '@/modules/promotions/promotions.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItemEntity]),
    CartModule,
    ProductsModule,
    PromotionsModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
