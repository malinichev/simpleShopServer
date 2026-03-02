import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import * as yaml from 'js-yaml'; // или 'yamljs'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Глобальный префикс API
  const apiPrefix = configService.get<string>('apiPrefix', 'api');
  app.setGlobalPrefix(apiPrefix);

  // CORS
  const corsOrigins = configService.get<string[]>('corsOrigins', [
    'http://localhost:3000',
  ]);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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

  if (!isProduction) {
    // Swagger документация (отключена в production)
    const config = new DocumentBuilder()
      .setTitle('Sports Shop API')
      .setDescription(
        'Backend API для интернет-магазина женской спортивной одежды',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Аутентификация и авторизация')
      .addTag('users', 'Управление пользователями')
      .addTag('products', 'Товары')
      .addTag('categories', 'Категории')
      .addTag('orders', 'Заказы')
      .addTag('cart', 'Корзина')
      .addTag('reviews', 'Отзывы')
      .addTag('promotions', 'Промокоды')
      .addTag('wishlist', 'Список желаний')
      .addTag('upload', 'Загрузка файлов')
      .addTag('analytics', 'Аналитика')
      .addTag('health', 'Health checks')
      .build();

    const document = SwaggerModule.createDocument(app, config);
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
  await app.listen(port);

  console.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}`,
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `📚 Swagger documentation: http://localhost:${port}/${apiPrefix}/docs`,
    );
    console.log(
      `📚 Swagger yaml file: http://localhost:${port}/${apiPrefix}/openapi.yaml`,
    );
  }
}

void bootstrap();
