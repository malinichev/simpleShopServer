import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Product } from './entities/product.entity';
import { ProductVariantEntity } from './entities/product-variant.entity';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { SearchModule } from '@/modules/search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariantEntity]),
    ConfigModule,
    CategoriesModule,
    SearchModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsRepository, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
