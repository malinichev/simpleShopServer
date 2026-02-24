import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Page } from './entities/page.entity';
import { PagesRepository } from './pages.repository';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';
import { UploadModule } from '@/modules/upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Page]), UploadModule],
  controllers: [PagesController],
  providers: [PagesRepository, PagesService],
  exports: [PagesService],
})
export class PagesModule {}
