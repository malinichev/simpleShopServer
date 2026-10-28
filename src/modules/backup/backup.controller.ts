import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Roles, UserRole } from '@/common/decorators/roles.decorator';
import { BackupService } from './backup.service';
import {
  BackupItemDto,
  RestoreBackupDto,
  RestoreBackupResponseDto,
} from './dto/backup.dto';

/**
 * Бэкап/восстановление БД. Доступно только главным администраторам —
 * роль выдаётся скриптом deploy/create-admin.sh или другим главным админом.
 */
@ApiTags('backups')
@ApiBearerAuth('JWT-auth')
@Controller('backups')
@Roles(UserRole.SUPER_ADMIN)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @ApiOperation({ summary: 'Список бэкапов (только главный администратор)' })
  @ApiOkResponse({ type: [BackupItemDto] })
  async list(): Promise<BackupItemDto[]> {
    return this.backupService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Создать бэкап БД' })
  @ApiOkResponse({ type: BackupItemDto })
  async create(): Promise<BackupItemDto> {
    return this.backupService.create();
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 512 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить файл бэкапа (ранее скачанный)' })
  @ApiResponse({ status: 201, type: BackupItemDto })
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('Файл бэкапа не предоставлен');
    }
    return this.backupService.saveUploaded(file.buffer, file.originalname);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Восстановить БД из бэкапа (email/пароль главных админов сохраняются текущими)',
  })
  @ApiParam({ name: 'id', description: 'Имя файла бэкапа' })
  @ApiResponse({ status: 200, type: RestoreBackupResponseDto })
  async restore(
    @Param('id') id: string,
    @Body() dto: RestoreBackupDto,
  ): Promise<RestoreBackupResponseDto> {
    return this.backupService.restore(id, {
      includeOrders: dto.includeOrders ?? false,
    });
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Скачать файл бэкапа' })
  @ApiParam({ name: 'id', description: 'Имя файла бэкапа' })
  @ApiResponse({ status: 200, description: 'Файл .json.gz' })
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { filePath, filename, sizeBytes } =
      await this.backupService.getDownload(id);
    // RFC 5987: для кириллицы в имени — filename*, ASCII-фолбэк в filename
    const asciiName = /^[\x20-\x7E]+$/.test(filename)
      ? filename.replace(/"/g, '')
      : 'backup.json.gz';
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': sizeBytes,
    });
    this.backupService.stream(filePath).pipe(res);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить файл бэкапа' })
  @ApiParam({ name: 'id', description: 'Имя файла бэкапа' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.backupService.remove(id);
  }
}
