import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Public } from '@/common/decorators/public.decorator';
import { ClientErrorDto } from './dto/client-error.dto';

/**
 * Приёмник ошибок витрины: клиентские error boundary и 5xx из baseQuery
 * шлют сюда, ошибки попадают в общий pino-лог (и в MAX при error-уровне).
 * Публичный — падение могло случиться до/вне авторизации.
 */
@ApiTags('client-errors')
@Controller('client-errors')
export class ClientErrorsController {
  constructor(
    @InjectPinoLogger(ClientErrorsController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ошибка клиента (витрина) — в лог сервера' })
  report(@Body() dto: ClientErrorDto) {
    const level = dto.level ?? 'error';
    const fields = {
      client: true,
      route: dto.route,
      digest: dto.digest,
      userAgent: dto.userAgent,
      err: { message: dto.message, stack: dto.stack?.slice(0, 2000) },
    };
    if (level === 'warn') {
      this.logger.warn(fields, `[client] ${dto.message}`);
    } else {
      this.logger.error(fields, `[client] ${dto.message}`);
    }
    return { ok: true };
  }
}
