import './bootstrap-env'; // side-effect: грузит .env ДО декораторов модулей (см. bootstrap-env.ts)
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import {
  createApiDocument,
  createPublicApiDocument,
} from './config/swagger.config';
import { AGENT_LLMS_TXT } from './config/agent-discovery';
import * as yaml from 'js-yaml'; // или 'yamljs'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Логгер приложения: pino + request-id (см. common/logger/app-logger.module.ts)
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  // Глобальный префикс API
  const apiPrefix = configService.get<string>('apiPrefix', 'api');
  app.setGlobalPrefix(apiPrefix);

  // CORS
  const corsOrigins = configService.get<string[]>('corsOrigins', [
    'http://localhost:3000',
    'http://localhost:4000',
  ]);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // За nginx: реальный IP клиента — в X-Forwarded-For (нужен ThrottlerGuard'у)
  (
    app.getHttpAdapter().getInstance() as {
      set: (k: string, v: unknown) => void;
    }
  ).set('trust proxy', 1);

  // Security
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      hsts: isProduction
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
    }),
  );
  app.use(cookieParser());

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Публичные файлы для ИИ-агентов: OpenAPI-спека (JSON) и llms.txt.
  // Middleware живёт ВНЕ guard'ов — доступно без авторизации в любом окружении.
  // Спека — createPublicApiDocument: пути без префикса /api (база в servers[]).
  let openApiDocument: ReturnType<typeof createPublicApiDocument> | null = null;
  const getOpenApiDocument = () => {
    openApiDocument ??= createPublicApiDocument(app);
    return openApiDocument;
  };

  app.use(`/${apiPrefix}/openapi.json`, (_: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(JSON.stringify(getOpenApiDocument()));
  });

  app.use(`/${apiPrefix}/llms.txt`, (_: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(AGENT_LLMS_TXT);
  });

  if (!isProduction) {
    // Swagger UI (отключён в production; nginx дополнительно блокирует /api/docs)
    const document = createApiDocument(app);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    // Эндпоинт для YAML
    app.use(`/${apiPrefix}/openapi.yaml`, (_: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/yaml');
      res.send((yaml as { dump: (obj: unknown) => string }).dump(document));
    });
  }

  const port = configService.get<number>('port', 4000);
  // В prod слушаем только loopback — внешний доступ идёт через nginx reverse proxy.
  // В dev оставляем 0.0.0.0 чтобы можно было стучаться из соседних контейнеров / мобилки в LAN.
  const host =
    configService.get<string>('nodeEnv') === 'production'
      ? '127.0.0.1'
      : '0.0.0.0';
  await app.listen(port, host);

  const logger = app.get(Logger);
  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}`,
  );

  if (process.env.NODE_ENV !== 'production') {
    logger.log(
      `📚 Swagger documentation: http://localhost:${port}/${apiPrefix}/docs`,
    );
    logger.log(
      `📚 Swagger yaml file: http://localhost:${port}/${apiPrefix}/openapi.yaml`,
    );
  }
}

void bootstrap();
