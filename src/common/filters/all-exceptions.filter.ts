import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';

type RequestWithId = Request & {
  id?: string;
  user?: { id?: string } | undefined;
};

/**
 * Глобальный фильтр исключений: каждая ошибка проходит через pino с контекстом
 * (requestId, userId, route) — и 5xx улетает алертом в MAX через tee-стрим.
 *
 * 4xx (валидация, not found, forbidden) — warn, тело ответа не меняется
 * (клиенты зависят от формы ошибок ValidationPipe/HttpException).
 * Необработанные исключения — error со стектрейзом + requestId в теле ответа.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : String(exception);

    const context = {
      requestId: request.id,
      userId: request.user?.id,
      method: request.method,
      url: request.originalUrl ?? request.url,
    };

    if (httpStatus >= 500) {
      this.logger.error(
        {
          err: {
            name: exception instanceof Error ? exception.name : 'UnknownError',
            message,
            stack: exception instanceof Error ? exception.stack : undefined,
          },
          status: httpStatus,
          ...context,
        },
        message,
      );
    } else {
      this.logger.warn({ status: httpStatus, ...context }, message);
    }

    const body = this.buildBody(exception, httpStatus, request.id);

    if (request.id) {
      response.setHeader('X-Request-Id', request.id);
    }

    const adapter = this.httpAdapterHost.httpAdapter;
    if (adapter) {
      adapter.reply(response, body, httpStatus);
    } else {
      response.status(httpStatus).json(body);
    }
  }

  private buildBody(exception: unknown, status: number, requestId?: string) {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        return status >= 500
          ? { ...(res as Record<string, unknown>), requestId }
          : res;
      }
      return status >= 500
        ? { statusCode: status, message: res, requestId }
        : { statusCode: status, message: res };
    }
    return {
      statusCode: status,
      message: 'Internal server error',
      requestId,
    };
  }
}
