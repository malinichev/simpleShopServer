import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '@/common/decorators/roles.decorator';
import { MarkingService } from './marking.service';
import {
  CreateMarkingCodeDto,
  BulkCreateMarkingCodesDto,
  UpdateMarkingStatusDto,
  BulkUpdateMarkingStatusDto,
  MarkingQueryDto,
} from './dto';

@ApiTags('marking')
@Controller('marking')
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class MarkingController {
  constructor(private readonly markingService: MarkingService) {}

  @Get()
  findAll(@Query() query: MarkingQueryDto) {
    return this.markingService.findAll(query);
  }

  @Get('stats')
  getStats(
    @Query('productId') productId?: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.markingService.getStats(productId, variantId);
  }

  @Post()
  create(@Body() dto: CreateMarkingCodeDto) {
    return this.markingService.create(dto);
  }

  @Post('bulk')
  bulkCreate(@Body() dto: BulkCreateMarkingCodesDto) {
    return this.markingService.bulkCreate(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarkingStatusDto,
  ) {
    return this.markingService.updateStatus(id, dto);
  }

  @Post('bulk-status')
  bulkUpdateStatus(@Body() dto: BulkUpdateMarkingStatusDto) {
    return this.markingService.bulkUpdateStatus(dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.markingService.delete(id);
  }
}
