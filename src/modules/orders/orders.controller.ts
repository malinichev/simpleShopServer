import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderQueryDto,
  OrderResponseDto,
} from './dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { User, UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Список заказов (user: свои, admin: все)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: OrderQueryDto,
  ) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER) {
      return this.ordersService.findAll(query);
    }
    return this.ordersService.findByUser(user._id.toString(), query);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Статистика заказов (admin)' })
  @ApiResponse({ status: 200, description: 'Order statistics' })
  async getStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getStats(
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по ID' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findById(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.findById(id);

    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.MANAGER &&
      order.userId.toString() !== user._id.toString()
    ) {
      throw new ForbiddenException('Нет доступа к этому заказу');
    }

    return order;
  }

  @Post()
  @ApiOperation({ summary: 'Создать заказ из корзины' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 400, description: 'Cart is empty or validation error' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user._id.toString(), dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Изменить статус заказа (admin)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user._id.toString(), dto.comment);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Отмена заказа (свой или admin)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot cancel order in current status' })
  @ApiResponse({ status: 403, description: 'Not allowed to cancel this order' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancel(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const isAdmin = user.role === UserRole.ADMIN;
    return this.ordersService.cancel(id, user._id.toString(), isAdmin);
  }
}
