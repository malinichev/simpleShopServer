import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Roles, UserRole } from '@/common/decorators/roles.decorator';
import { ImageRegenService } from './image-regen.service';
import { StartImageRegenDto } from './dto';

@ApiTags('image-regen')
@Controller('image-regen')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiBearerAuth('JWT-auth')
export class ImageRegenController {
  constructor(private readonly imageRegenService: ImageRegenService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Конфигурация ИИ-генерации (драйвер, модель, пресеты промптов)',
  })
  @ApiResponse({ status: 200 })
  async getConfig() {
    return this.imageRegenService.getConfig();
  }

  @Post('jobs')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Запустить регенерацию выбранных фото товара' })
  @ApiResponse({ status: 201 })
  async start(
    @Body() dto: StartImageRegenDto,
    @Req() req: Request & { user?: { sub?: string; id?: string } },
  ) {
    const userId = req.user?.sub || req.user?.id || '';
    return this.imageRegenService.start(dto, userId);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Список задач регенерации (опционально по товару)' })
  @ApiResponse({ status: 200 })
  async getJobs(
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.imageRegenService.findJobs(
      productId || undefined,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20,
    );
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Задача регенерации по id (для поллинга статуса)' })
  @ApiResponse({ status: 200 })
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.imageRegenService.findJob(id);
  }
}
