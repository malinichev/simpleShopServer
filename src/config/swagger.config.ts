import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Единый источник OpenAPI-документа: используется и main.ts (Swagger UI),
 * и scripts/export-openapi.ts (экспорт контракта в /openapi.json для фронтов).
 * Меняется здесь — меняется везде.
 */
export function createApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, buildDocumentOptions());
}

/**
 * Спека для публичной раздачи ИИ-агентам (/api/openapi.json в main.ts):
 * пути БЕЗ глобального префикса /api — база уже задана в servers[]
 * (https://api.svoybrand.shop/api + /products). Консистентна экспортируемому
 * в монорепо openapi.json, на который ссылается llms.txt.
 */
export function createPublicApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, buildDocumentOptions(), {
    ignoreGlobalPrefix: true,
  });
}

function buildDocumentOptions() {
  const config = new DocumentBuilder()
    .setTitle('Sports Shop API')
    .setDescription(
      [
        'Backend API для интернет-магазина женской спортивной одежды.',
        '',
        'Публичные read-only эндпоинты каталога (без авторизации):',
        'GET /products, /products/facets, /products/search, /products/slug/{slug},',
        'GET /products/{id}, /products/{id}/siblings, /products/{id}/related,',
        'GET /categories, /categories/tree, /categories/slug/{slug}, /pages/{slug}.',
        'Остальные эндпоинты требуют JWT (bearer). Спецификация публикуется на',
        'https://api.svoybrand.shop/api/openapi.json — точка входа для ИИ-агентов (см. llms.txt).',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addServer('https://api.svoybrand.shop/api', 'production')
    .addServer('http://localhost:4000/api', 'local development')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Аутентификация и авторизация')
    .addTag('users', 'Управление пользователями')
    .addTag('products', 'Товары')
    .addTag('categories', 'Категории')
    .addTag('orders', 'Заказы')
    .addTag('payments', 'Платежи')
    .addTag('cart', 'Корзина')
    .addTag('reviews', 'Отзывы')
    .addTag('promotions', 'Промокоды')
    .addTag('wishlist', 'Список желаний')
    .addTag('upload', 'Загрузка файлов')
    .addTag('analytics', 'Аналитика')
    .addTag('settings', 'Настройки магазина')
    .addTag('pages', 'CMS-страницы')
    .addTag('marking', 'Коды маркировки')
    .addTag('health', 'Health checks')
    .build();

  return config;
}
