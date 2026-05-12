import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'Активные платёжные провайдеры (что доступно из env)',
  })
  getEnabledProviders() {
    return { providers: this.paymentsService.getEnabledProviders() };
  }

  @Public()
  @Post(':provider/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook от платёжного провайдера' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
  ) {
    // ВАЖНО: для подписи Stripe нужен raw body. Конфигурируется в main.ts через
    // bodyParser.raw({ type: 'application/json' }) на /api/payments/stripe/webhook,
    // либо @RawBody() декоратор. В шаблоне раскомментируй когда добавляешь Stripe.
    const rawBody: Buffer | string =
      (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body);

    return this.paymentsService.handleWebhook(
      provider,
      rawBody,
      req.headers,
      query,
    );
  }
}
