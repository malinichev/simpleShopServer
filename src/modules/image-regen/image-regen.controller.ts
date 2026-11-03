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
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Roles, UserRole } from '@/common/decorators/roles.decorator';
import { ImageRegenService } from './image-regen.service';
import { StartImageRegenDto, AnalyzeImagesDto } from './dto';

@ApiTags('image-regen')
@Controller('image-regen')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiBearerAuth('JWT-auth')
export class ImageRegenController {
  constructor(private readonly imageRegenService: ImageRegenService) {}

  @Get('config')
  // Читается при каждом открытии диалога; GET-поллинг за админ-авторизацией —
  // без персонального лимита (иначе глобальный троттлер ловит bulk-сессии)
  @SkipThrottle()
  @ApiOperation({
    summary: 'Конфигурация ИИ-генерации (драйвер, модель, пресеты промптов)',
  })
  @ApiResponse({ status: 200 })
  async getConfig() {
    return this.imageRegenService.getConfig();
  }

  @Post('analyze')
  // Bulk: товаров много, у каждого до 10 фото — анализ каждым фото.
  // Эндпоинт за ADMIN/MANAGER-авторизацией, троттлер тут лишь страховка от
  // зарезвившегося клиента, поэтому лимит высокий.
  @Throttle({ default: { ttl: 60000, limit: 600 } })
  @ApiOperation({
    summary: 'Vision-анализ выбранных фото: что за вещь + подходящие сцены под концепцию магазина',
  })
  @ApiResponse({ status: 201 })
  async analyze(@Body() dto: AnalyzeImagesDto) {
    return this.imageRegenService.analyze(dto);
  }

  @Post('jobs')
  // Bulk: один job на товар — выборка из многих товаров даёт пучок запросов
  @Throttle({ default: { ttl: 60000, limit: 300 } })
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
  @SkipThrottle()
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
  // Поллинг статуса каждые 2с (× число job'ов при bulk) — без лимита,
  // эндпоинт за ADMIN/MANAGER, чтение не мутирует ничего
  @SkipThrottle()
  @ApiOperation({ summary: 'Задача регенерации по id (для поллинга статуса)' })
  @ApiResponse({ status: 200 })
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.imageRegenService.findJob(id);
  }
}
