import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Page } from './entities/page.entity';
import { PageFileRecord } from './entities/page-file.entity';
import { PagesRepository } from './pages.repository';
import { PageFilesRepository } from './page-files.repository';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';
import { UploadModule } from '@/modules/upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Page, PageFileRecord]), UploadModule],
  controllers: [PagesController],
  providers: [PagesRepository, PageFilesRepository, PagesService],
  exports: [PagesService],
})
export class PagesModule {}
