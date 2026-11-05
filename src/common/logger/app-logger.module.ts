import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { stdTimeFunctions } from 'pino';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { AlertGate } from './max-alert-core';
import { MaxAlertStream } from './max-alert-stream';
import { sendMaxMessage } from './max-notifier';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Сквозной идентификатор запроса: из заголовка (валидный UUID) или новый. */
function genReqId(req: Request, res: Response): string {
  const header = req.headers['x-request-id'];
  const id =
    typeof header === 'string' && UUID_RE.test(header) ? header : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

export function buildParams(configService: ConfigService): Params {
  const isProd = process.env.NODE_ENV === 'production';
  const level = configService.get<string>(
    'logging.level',
    isProd ? 'info' : 'debug',
  );

  // Dev: человекочитаемый вывод через pino-pretty (опциональная dev-зависимость)
  let pretty: { write: (line: string) => void } | null = null;
  if (!isProd) {
    try {
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
      const { build } = require('pino-pretty');
      const prettyStream = build({
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service',
      });
      pretty = { write: (line) => prettyStream.write(line) };
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
    } catch {
      pretty = null; // pino-pretty не установлен — сырой JSON, это нормально
    }
  }

  const maxConfig = {
    token: configService.get<string>('maxBot.token', ''),
    chatId: configService.get<string>('maxBot.chatId', ''),
    apiUrl: configService.get<string>(
      'maxBot.apiUrl',
      'https://platform-api2.max.ru',
    ),
  };
  // Алерты в MAX — только production или явный MAX_ALERTS_ENABLED=true
  // (политика в max-bot.config.ts): локальная разработка и e2e молчат,
  // даже если dev-env случайно синхронизирован с продовым.
  const maxEnabled = configService.get<boolean>('maxBot.enabled', false);

  const gate = new AlertGate({
    cooldownMs: 10 * 60 * 1000,
    windowMs: 5 * 60 * 1000,
    capacity: 20,
  });

  const stream = new MaxAlertStream({
    gate,
    notify: (text) => sendMaxMessage(text, maxConfig),
    pretty,
    enabled: maxEnabled,
  });

  return {
    pinoHttp: [
      {
        level,
        base: { service: 'svoybrand-api' },
        timestamp: stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label }),
        },
        genReqId,
        customProps: (req: Request) => {
          const user = (req as Request & { user?: { id?: string } }).user;
          return user?.id ? { userId: user.id } : {};
        },
        autoLogging: {
          ignore: (req) => req.url?.includes('/health') ?? false,
        },
        customLogLevel: (_req, res, err) => {
          if (res.statusCode >= 500 || err) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[REDACTED]',
        },
      },
      stream,
    ],
  };
}

/**
 * Логирование приложения: pino (JSON в stdout) + nestjs-pino (контекст
 * запроса, request-id) + глобальный фильтр исключений + алерты в MAX.
 */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildParams,
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppLoggerModule {}
