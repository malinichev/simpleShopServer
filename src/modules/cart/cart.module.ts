import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from './entities/cart.entity';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { SessionIdMiddleware } from './middleware/session-id.middleware';
import { ProductsModule } from '@/modules/products/products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart]),
    ProductsModule,
  ],
  controllers: [CartController],
  providers: [CartRepository, CartService],
  exports: [CartService],
})
export class CartModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SessionIdMiddleware)
      .forRoutes(CartController);
  }
}
