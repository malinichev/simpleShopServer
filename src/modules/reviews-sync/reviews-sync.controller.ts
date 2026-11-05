import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '@/common/decorators/roles.decorator';
import { ReviewsSyncService } from './reviews-sync.service';

/**
 * Ручной синк отзывов с Сималенда (кнопка в админке на странице отзывов).
 * Прогон длительный (минуты) — POST сразу отдаёт running-строку, админка
 * опрашивает GET /runs/:id до finished. Cron не используется.
 */
@ApiTags('reviews-sync')
@Controller('reviews-sync')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class ReviewsSyncController {
  constructor(private readonly reviewsSyncService: ReviewsSyncService) {}

  @Post('run')
  async run() {
    return this.reviewsSyncService.startBackgroundRun();
  }

  @Get('runs')
  async runs(@Query('limit') limit?: string) {
    const parsed = limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10;
    return this.reviewsSyncService.findLatestRuns(parsed);
  }

  @Get('runs/:id')
  async runStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsSyncService.findRun(id);
  }
}
