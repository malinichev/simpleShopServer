import {
  Controller,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsQueryDto,
  TrackEventDto,
  DashboardResponseDto,
  SalesDataDto,
  VisitorsDataDto,
  CustomerStatsDto,
} from './dto';
import { TopProductStat, TopCategoryStat } from './entities/analytics.entity';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Данные дашборда' })
  @ApiResponse({ status: 200, type: DashboardResponseDto })
  async getDashboard(): Promise<DashboardResponseDto> {
    return this.analyticsService.getDashboard();
  }

  @Get('sales')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Статистика продаж' })
  @ApiResponse({ status: 200, type: [SalesDataDto] })
  async getSales(@Query() query: AnalyticsQueryDto): Promise<SalesDataDto[]> {
    return this.analyticsService.getSales(query);
  }

  @Get('visitors')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Статистика посещений' })
  @ApiResponse({ status: 200, type: [VisitorsDataDto] })
  async getVisitors(@Query() query: AnalyticsQueryDto): Promise<VisitorsDataDto[]> {
    return this.analyticsService.getVisitors(query);
  }

  @Get('products')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Топ товаров' })
  @ApiQuery({ name: 'limit', required: false, description: 'Количество (default 10)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Начало периода' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Конец периода' })
  @ApiResponse({ status: 200 })
  async getTopProducts(
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<TopProductStat[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    return this.analyticsService.getTopProducts(parsedLimit, from, to);
  }

  @Get('categories')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Топ категорий' })
  @ApiQuery({ name: 'limit', required: false, description: 'Количество (default 10)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Начало периода' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Конец периода' })
  @ApiResponse({ status: 200 })
  async getTopCategories(
    @Query('limit') limit?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<TopCategoryStat[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    return this.analyticsService.getTopCategories(parsedLimit, from, to);
  }

  @Get('customers')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Статистика клиентов' })
  @ApiResponse({ status: 200, type: CustomerStatsDto })
  async getCustomerStats(): Promise<CustomerStatsDto> {
    return this.analyticsService.getCustomerStats();
  }

  @Public()
  @Post('track')
  @ApiOperation({ summary: 'Трекинг события' })
  @ApiResponse({ status: 201, description: 'Событие принято' })
  async trackEvent(@Body() dto: TrackEventDto): Promise<{ success: true }> {
    await this.analyticsService.trackEvent(dto);
    return { success: true };
  }
}
