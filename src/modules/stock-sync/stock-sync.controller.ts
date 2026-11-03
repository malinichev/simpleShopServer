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
import { StockSyncService } from './stock-sync.service';

/**
 * Ручной синк остатков с Сималенда (кнопка на странице «Товары»).
 * Прогон длительный (~минута) — POST сразу отдаёт running-строку,
 * админка опрашивает GET /runs/:id до finished.
 */
@ApiTags('stock-sync')
@Controller('stock-sync')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class StockSyncController {
  constructor(private readonly stockSyncService: StockSyncService) {}

  @Post('run')
  async run() {
    return this.stockSyncService.startBackgroundRun();
  }

  @Get('runs')
  async runs(@Query('limit') limit?: string) {
    const parsed = limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10;
    return this.stockSyncService.findLatestRuns(parsed);
  }

  @Get('runs/:id')
  async runStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockSyncService.findRun(id);
  }
}
