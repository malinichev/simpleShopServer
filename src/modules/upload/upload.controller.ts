import {
  Controller,
  Post,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UploadService } from './upload.service';
import { UploadResponseDto } from './dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить одно изображение (admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiQuery({ name: 'folder', description: 'Папка в S3', example: 'products/123', required: false })
  @ApiResponse({ status: 201, type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Некорректный файл' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string = 'uploads',
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }
    return this.uploadService.uploadImage(file, folder);
  }

  @Post('images')
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить несколько изображений, макс. 10 (admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @ApiQuery({ name: 'folder', description: 'Папка в S3', example: 'products/123', required: false })
  @ApiResponse({ status: 201, type: [UploadResponseDto] })
  @ApiResponse({ status: 400, description: 'Некорректные файлы' })
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder: string = 'uploads',
  ): Promise<UploadResponseDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Файлы не предоставлены');
    }
    return this.uploadService.uploadImages(files, folder);
  }

  @Delete()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить файл из S3 (admin)' })
  @ApiQuery({ name: 'key', description: 'Ключ файла в S3', required: true })
  @ApiResponse({ status: 204, description: 'Файл удалён' })
  @ApiResponse({ status: 400, description: 'Ключ не указан' })
  async deleteFile(@Query('key') key: string): Promise<void> {
    if (!key) {
      throw new BadRequestException('Ключ файла не указан');
    }
    await this.uploadService.deleteFile(key);
  }
}
