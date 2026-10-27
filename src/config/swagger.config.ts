import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Единый источник OpenAPI-документа: используется и main.ts (Swagger UI),
 * и scripts/export-openapi.ts (экспорт контракта в /openapi.json для фронтов).
 * Меняется здесь — меняется везде.
 */
export function createApiDocument(app: INestApplication) {
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

  return SwaggerModule.createDocument(app, config);
}
