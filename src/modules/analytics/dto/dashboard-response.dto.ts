import { ApiProperty } from '@nestjs/swagger';

export class PeriodComparisonDto {
  @ApiProperty()
  current: number;

  @ApiProperty()
  previous: number;

  @ApiProperty({ description: 'Изменение в процентах' })
  changePercent: number;
}

export class DashboardResponseDto {
  @ApiProperty()
  totalRevenue: PeriodComparisonDto;

  @ApiProperty()
  ordersCount: PeriodComparisonDto;

  @ApiProperty()
  averageOrderValue: PeriodComparisonDto;

  @ApiProperty()
  totalCustomers: number;

  @ApiProperty()
  newCustomersToday: number;

  @ApiProperty()
  visitorsToday: number;

  @ApiProperty()
  conversionRate: number;

  @ApiProperty({ description: 'Последние заказы' })
  recentOrdersCount: number;

  @ApiProperty({ description: 'Товаров в наличии' })
  productsInStock: number;
}

export class SalesDataDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  ordersCount: number;

  @ApiProperty()
  averageOrderValue: number;
}

export class VisitorsDataDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  visitors: number;

  @ApiProperty()
  uniqueVisitors: number;

  @ApiProperty()
  pageViews: number;
}

export class CustomerStatsDto {
  @ApiProperty()
  totalCustomers: number;

  @ApiProperty()
  newCustomersThisMonth: number;

  @ApiProperty()
  returningCustomers: number;

  @ApiProperty()
  averageOrdersPerCustomer: number;
}
