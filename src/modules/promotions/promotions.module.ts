import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { PromotionsRepository } from './promotions.repository';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion])],
  controllers: [PromotionsController],
  providers: [PromotionsRepository, PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
