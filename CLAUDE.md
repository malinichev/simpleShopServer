# Backend для интернет-магазина женской спортивной одежды

## Описание проекта
Backend API для интернет-магазина женской спортивной одежды. Это первый этап разработки — после него будут созданы админка (React + Vite) и клиентская часть (Next.js).

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Runtime | Node.js 20+ |
| Framework | NestJS 10+ |
| Language | TypeScript 5+ (strict mode, без `any`) |
| ORM | TypeORM |
| Database | MongoDB 7+ |
| Cache | Redis |
| Auth | Passport.js, JWT (access + refresh tokens) |
| Validation | class-validator, class-transformer |
| Documentation | Swagger/OpenAPI |
| File Upload | Multer + Sharp |
| File Storage | MinIO (S3-compatible) |
| Queue | BullMQ + Redis |
| Email | Nodemailer + Handlebars |
| Security | Helmet, CORS, rate-limiting, bcrypt |
| Testing | Jest, Supertest |

## Архитектурные принципы

1. **Модульность** — каждый модуль NestJS должен быть автономным и содержать свои entities, DTOs, controller, service, repository
2. **Repository Pattern** — работа с БД через отдельные repository-классы
3. **Strict TypeScript** — никаких `any`, все типы явно определены
4. **Валидация** — все входные данные валидируются через class-validator
5. **Swagger** — документация для всех endpoints
6. **Глобальные фильтры** — единообразная обработка ошибок

## Структура проекта
/server/src ├── /modules # Бизнес-модули (auth, users, products, etc.) ├── /common # Shared код (decorators, filters, guards, pipes, interceptors) ├── /config # Конфигурации ├── /database # Seeds и database module ├── /jobs # BullMQ processors ├── app.module.ts └── main.ts


## Стандарты кода

### Response Format
```typescript
// Success
{ "success": true, "data": {...}, "meta"?: {...} }

// Error
{ "success": false, "error": { "code": "...", "message": "...", "details"?: [...] } }
Naming Conventions
Файлы: kebab-case (create-product.dto.ts)
Классы: PascalCase (CreateProductDto)
Переменные/функции: camelCase
Константы: UPPER_SNAKE_CASE
Порт и префикс API
Port: 4000
API Prefix: /api
Swagger: /api/docs
Окружение
Конфигурация через переменные окружения (.env):

MongoDB, Redis, MinIO
JWT secrets и сроки действия токенов
SMTP для email
Rate limiting параметры
```

# Последовательный список задач

## Обзор задач

| # | Задача | Зависимости |
|---|--------|-------------|
| 1 | Инициализация проекта и базовая конфигурация | — |
| 2 | Common модуль (shared код) | 1 |
| 3 | Database модуль и подключение MongoDB | 1, 2 |
| 4 | Health модуль | 1, 2, 3 |
| 5 | Users модуль (entity, repository, service) | 3 |
| 6 | Auth модуль | 5 |
| 7 | Categories модуль | 3 |
| 8 | Products модуль | 3, 7 |
| 9 | Upload модуль (MinIO + Sharp) | 2 |
| 10 | Cart модуль | 5, 8 |
| 11 | Promotions модуль | 3 |
| 12 | Orders модуль | 5, 8, 10, 11 |
| 13 | Reviews модуль | 5, 8, 12 |
| 14 | Wishlist модуль | 5, 8 |
| 15 | Mail модуль (Nodemailer + BullMQ) | 2 |
| 16 | Analytics модуль | 5, 8, 12 |
| 17 | Seed-скрипты | 5, 7, 8 |
| 18 | Docker и финальная интеграция | Все |