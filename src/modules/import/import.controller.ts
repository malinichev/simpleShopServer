import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles, UserRole } from '@/common/decorators/roles.decorator';
import { ImportService } from './import.service';
import { StartImportDto } from './dto';
import { UploadService } from '@/modules/upload/upload.service';

@ApiTags('import')
@Controller('import')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly uploadService: UploadService,
  ) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async preview(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV файл не предоставлен');
    }
    if (!file.originalname.endsWith('.csv') && file.mimetype !== 'text/csv') {
      throw new BadRequestException('Допускаются только CSV файлы');
    }

    // Upload to S3 for later use
    const key = `imports/${Date.now()}-${file.originalname}`;
    await this.uploadService.uploadBuffer(file.buffer, key, 'text/csv');

    const preview = await this.importService.preview(file.buffer);
    return { ...preview, fileKey: key };
  }

  @Post('start')
  async start(@Body() dto: StartImportDto, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.importService.start(dto, userId);
  }

  @Get('jobs')
  async getJobs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.importService.findJobs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('jobs/:id')
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.importService.findJob(id);
  }

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const csv = this.importService.getTemplate();
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="import-template.csv"',
    });
    // Add BOM for Excel UTF-8 support
    res.send('\uFEFF' + csv);
  }
}
