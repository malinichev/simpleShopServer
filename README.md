# Sports Shop API

Backend API для интернет-магазина женской спортивной одежды.

## Технологии

- **Runtime:** Node.js 24
- **Framework:** NestJS 11
- **Language:** TypeScript 5 (strict mode)
- **ORM:** TypeORM
- **Database:** MongoDB 7
- **Cache:** Redis
- **Auth:** Passport.js + JWT (access + refresh tokens)
- **Validation:** class-validator, class-transformer
- **Documentation:** Swagger/OpenAPI
- **File Upload:** Multer + Sharp
- **File Storage:** MinIO (S3-compatible)
- **Queue:** BullMQ + Redis
- **Email:** Nodemailer + Handlebars
- **Security:** Helmet, CORS, rate-limiting, bcrypt

## Установка и запуск

### Локальная разработка

```bash
# Установка зависимостей
pnpm install

# Запуск инфраструктуры (MongoDB, Redis, MinIO)
pnpm run docker:up

# Запуск сервера в dev-режиме
pnpm run start:dev

# Заполнение БД тестовыми данными
pnpm run seed
```

### Docker (development)

```bash
docker-compose up -d
```

### Docker (production)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## API документация

После запуска сервера Swagger UI доступен по адресу:

```
http://localhost:4000/api/docs
```

## Структура проекта

```
server/src
├── config/          # Конфигурации (app, database, jwt, redis, s3, mail, throttle)
├── common/          # Shared код (decorators, filters, guards, pipes, interceptors, types)
├── database/        # Database module, seeds
├── jobs/            # BullMQ job processors
├── modules/
│   ├── auth/        # Аутентификация и авторизация
│   ├── users/       # Пользователи
│   ├── categories/  # Категории товаров
│   ├── products/    # Товары
│   ├── upload/      # Загрузка файлов (MinIO + Sharp)
│   ├── cart/        # Корзина
│   ├── promotions/  # Промокоды и акции
│   ├── orders/      # Заказы
│   ├── reviews/     # Отзывы
│   ├── wishlist/    # Список желаний
│   ├── mail/        # Отправка email
│   ├── analytics/   # Аналитика
│   └── health/      # Health checks
├── app.module.ts
└── main.ts
```

## Переменные окружения

Создайте файл `.env` на основе `.env.example`:

| Переменная | Описание | Пример |
|---|---|---|
| `PORT` | Порт сервера | `4000` |
| `NODE_ENV` | Окружение | `development` |
| `MONGODB_URI` | URI MongoDB | `mongodb://localhost:27017/sports-shop` |
| `REDIS_HOST` | Хост Redis | `localhost` |
| `REDIS_PORT` | Порт Redis | `6379` |
| `REDIS_PASSWORD` | Пароль Redis | — |
| `JWT_ACCESS_SECRET` | Секрет access-токена | — |
| `JWT_REFRESH_SECRET` | Секрет refresh-токена | — |
| `JWT_ACCESS_EXPIRATION` | Время жизни access-токена | `15m` |
| `JWT_REFRESH_EXPIRATION` | Время жизни refresh-токена | `7d` |
| `S3_ENDPOINT` | Endpoint MinIO/S3 | `http://localhost:9000` |
| `S3_ACCESS_KEY` | Access key MinIO | `minioadmin` |
| `S3_SECRET_KEY` | Secret key MinIO | `minioadmin` |
| `S3_BUCKET` | Имя бакета | `sports-shop` |
| `SMTP_HOST` | SMTP хост | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP порт | `587` |
| `SMTP_USER` | SMTP пользователь | — |
| `SMTP_PASSWORD` | SMTP пароль | — |
| `THROTTLE_TTL` | TTL rate-limiter (сек) | `60` |
| `THROTTLE_LIMIT` | Лимит запросов | `100` |

## Команды

```bash
pnpm run build          # Сборка проекта
pnpm run start          # Запуск
pnpm run start:dev      # Запуск в dev-режиме (watch)
pnpm run start:debug    # Запуск в debug-режиме
pnpm run start:prod     # Запуск production-сборки
pnpm run lint           # Линтинг
pnpm run format         # Форматирование кода
pnpm run test           # Запуск тестов
pnpm run test:watch     # Тесты в watch-режиме
pnpm run test:cov       # Тесты с coverage
pnpm run test:e2e       # E2E тесты
pnpm run seed           # Заполнение БД тестовыми данными
pnpm run docker:up      # Запуск Docker контейнеров
pnpm run docker:down    # Остановка Docker контейнеров
pnpm run docker:logs    # Логи сервера в Docker
```

## Безопасность

- Хеширование паролей (bcrypt)
- JWT токены (access + refresh)
- HTTP-only cookies для refresh token
- Rate limiting
- Helmet для HTTP заголовков
- CORS настройка
- Валидация всех входных данных

## Тестирование

```bash
# Unit-тесты
pnpm run test

# E2E-тесты
pnpm run test:e2e

# Покрытие кода
pnpm run test:cov
```

## Docker

```bash
# Запуск всех сервисов (development)
docker-compose up -d

# Только инфраструктура
docker-compose up -d mongo redis minio

# Production
docker-compose -f docker-compose.prod.yml up -d

# Остановка
docker-compose down

# Остановка с удалением volumes
docker-compose down -v

# Логи сервера
docker-compose logs -f server
```

## Лицензия

MIT
