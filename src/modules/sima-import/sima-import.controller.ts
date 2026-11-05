import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';
import { SimaImportService } from './sima-import.service';
import type { SimaPreviewResult } from './sima-import.service';

export class StartSimaImportDto {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsOptional()
  @IsBoolean()
  onlyWomen?: boolean;
}

@ApiTags('sima-import')
@Controller('sima-import')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class SimaImportController {
  constructor(private readonly simaImportService: SimaImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Разобрать выгрузку Сималенда (без скрейпа)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Саммари выгрузки + fileKey' })
  async preview(@UploadedFile() file: Express.Multer.File): Promise<SimaPreviewResult> {
    if (!file) {
      throw new BadRequestException('CSV файл не предоставлен');
    }
    return this.simaImportService.preview(file);
  }

  @Post('start')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Запустить загрузку с Сималенда (фоновая задача)' })
  async start(
    @Body() dto: StartSimaImportDto,
    @Req() req: Request & { user?: { sub?: string; id?: string } },
  ) {
    const userId = req.user?.sub || req.user?.id || '';
    return this.simaImportService.start(
      dto.fileKey,
      dto.onlyWomen ?? true,
      userId,
    );
  }

  @Get('jobs')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'История загрузок с Сималенда' })
  async getJobs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.simaImportService.findJobs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('jobs/active')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Активная задача (индикатор в шапке админки)' })
  async getActiveJob() {
    return this.simaImportService.findActiveJob();
  }

  @Get('jobs/:id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Задача загрузки (поллинг прогресса)' })
  async getJob(@Param('id') id: string) {
    return this.simaImportService.findJob(id);
  }

  @Post('jobs/:id/cancel')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Отменить фоновую загрузку' })
  async cancel(@Param('id') id: string) {
    return this.simaImportService.requestCancel(id);
  }
}
