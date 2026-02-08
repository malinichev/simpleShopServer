import { Controller, Get } from '@nestjs/common';
import {ApiTags, ApiOperation, ApiResponse, ApiBearerAuth} from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @ApiBearerAuth('JWT-auth')
  @HealthCheck()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }

  @Get('ready')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Readiness check' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  ready() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}