import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  UpdateSettingsDto,
  CreateShippingMethodDto,
  UpdateShippingMethodDto,
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@/modules/users/entities/user.entity';

@ApiTags('settings')
@Controller('settings')
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ======================== General Settings ========================

  @Get()
  @ApiOperation({ summary: 'Получить настройки магазина' })
  @ApiResponse({ status: 200 })
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  @ApiOperation({ summary: 'Обновить настройки магазина' })
  @ApiResponse({ status: 200 })
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  // ======================== Shipping Methods ========================

  @Get('shipping-methods')
  @ApiOperation({ summary: 'Получить все способы доставки' })
  @ApiResponse({ status: 200 })
  async findAllShippingMethods() {
    return this.settingsService.findAllShippingMethods();
  }

  @Post('shipping-methods')
  @ApiOperation({ summary: 'Создать способ доставки' })
  @ApiResponse({ status: 201 })
  async createShippingMethod(@Body() dto: CreateShippingMethodDto) {
    return this.settingsService.createShippingMethod(dto);
  }

  @Patch('shipping-methods/:id')
  @ApiOperation({ summary: 'Обновить способ доставки' })
  @ApiParam({ name: 'id', description: 'Shipping method ID' })
  @ApiResponse({ status: 200 })
  async updateShippingMethod(
    @Param('id') id: string,
    @Body() dto: UpdateShippingMethodDto,
  ) {
    return this.settingsService.updateShippingMethod(id, dto);
  }

  @Delete('shipping-methods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить способ доставки' })
  @ApiParam({ name: 'id', description: 'Shipping method ID' })
  async deleteShippingMethod(@Param('id') id: string): Promise<void> {
    return this.settingsService.deleteShippingMethod(id);
  }

  // ======================== Payment Methods ========================

  @Get('payment-methods')
  @ApiOperation({ summary: 'Получить все способы оплаты' })
  @ApiResponse({ status: 200 })
  async findAllPaymentMethods() {
    return this.settingsService.findAllPaymentMethods();
  }

  @Post('payment-methods')
  @ApiOperation({ summary: 'Создать способ оплаты' })
  @ApiResponse({ status: 201 })
  async createPaymentMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.settingsService.createPaymentMethod(dto);
  }

  @Patch('payment-methods/:id')
  @ApiOperation({ summary: 'Обновить способ оплаты' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200 })
  async updatePaymentMethod(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.settingsService.updatePaymentMethod(id, dto);
  }

  @Delete('payment-methods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить способ оплаты' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async deletePaymentMethod(@Param('id') id: string): Promise<void> {
    return this.settingsService.deletePaymentMethod(id);
  }
}
