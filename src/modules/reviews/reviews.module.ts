import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Review } from './entities/review.entity';
import { ExternalReview } from './entities/external-review.entity';
import { ReviewsRepository } from './reviews.repository';
import { ExternalReviewsRepository } from './external-reviews.repository';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { OrdersModule } from '@/modules/orders/orders.module';
import { ProductsModule } from '@/modules/products/products.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, ExternalReview]),
    ConfigModule,
    OrdersModule,
    ProductsModule,
    UsersModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsRepository, ExternalReviewsRepository, ReviewsService],
  exports: [ReviewsService, ExternalReviewsRepository],
})
export class ReviewsModule {}
