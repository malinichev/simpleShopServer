# Sports Shop Backend API

Backend API для интернет-магазина женской спортивной одежды на NestJS + MongoDB.

## 🚀 Быстрый старт

### Установка зависимостей

```bash
npm install
```

### Запуск инфраструктуры (MongoDB, Redis, MinIO)

```bash
docker-compose up -d mongo redis minio
```

### Запуск в режиме разработки

```bash
npm run start:dev
```

### Заполнение базы тестовыми данными

```bash
npm run seed
```

### Swagger документация

После запуска приложения документация доступна по адресу:
```
http://localhost:4000/api/docs
```

## 📁 Структура проекта

```
/server
├── /src
│   ├── /modules          # Бизнес-модули
│   │   ├── /auth         # Аутентификация и авторизация
│   │   ├── /users        # Управление пользователями
│   │   ├── /products     # Товары
│   │   ├── /categories   # Категории
│   │   ├── /orders       # Заказы
│   │   ├── /cart         # Корзина
│   │   ├── /reviews      # Отзывы
│   │   ├── /promotions   # Промокоды
│   │   ├── /wishlist     # Список желаний
│   │   ├── /upload       # Загрузка файлов
│   │   ├── /mail         # Email уведомления
│   │   ├── /analytics    # Аналитика
│   │   └── /health       # Health checks
│   │
│   ├── /common           # Общие утилиты
│   │   ├── /decorators   # Декораторы
│   │   ├── /filters      # Exception фильтры
│   │   ├── /guards       # Guards
│   │   ├── /interceptors # Interceptors
│   │   ├── /pipes        # Pipes
│   │   ├── /middleware   # Middleware
│   │   └── /types        # Типы
│   │
│   ├── /config           # Конфигурация
│   ├── /database         # База данных и seeds
│   ├── /jobs             # Очереди (BullMQ)
│   ├── app.module.ts     # Главный модуль
│   └── main.ts           # Точка входа
│
├── /test                 # E2E тесты
├── docker-compose.yml    # Docker конфигурация
├── Dockerfile            # Production образ
└── package.json          # Зависимости
```

## 🔧 Следующие шаги для завершения проекта

### 1. Создать общие утилиты (common)

#### Filters
- `http-exception.filter.ts` - обработка HTTP исключений
- `mongo-exception.filter.ts` - обработка MongoDB ошибок

#### Guards
- `jwt-auth.guard.ts` - проверка JWT токена
- `roles.guard.ts` - проверка ролей пользователя
- `refresh-token.guard.ts` - проверка refresh токена

#### Interceptors
- `transform.interceptor.ts` - трансформация ответов
- `logging.interceptor.ts` - логирование запросов
- `cache.interceptor.ts` - кэширование

#### Pipes
- `parse-object-id.pipe.ts` - парсинг MongoDB ObjectId
- `validation.pipe.ts` - валидация DTO

#### Middleware
- `logger.middleware.ts` - логирование HTTP запросов

### 2. Создать модуль Users

#### Entities
```typescript
// user.entity.ts
@Entity('users')
export class User {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string; // bcrypt hashed

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ nullable: true })
  avatar?: string;

  @Column('json', { default: [] })
  addresses: Address[];

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  refreshToken?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### DTOs
- `create-user.dto.ts`
- `update-user.dto.ts`
- `user-response.dto.ts`

#### Service
- CRUD операции
- Хеширование паролей (bcrypt)
- Управление refresh токенами

### 3. Создать модуль Auth

#### Strategies
- `local.strategy.ts` - локальная аутентификация
- `jwt.strategy.ts` - JWT access token
- `jwt-refresh.strategy.ts` - JWT refresh token

#### DTOs
- `register.dto.ts`
- `login.dto.ts`
- `tokens.dto.ts`

#### Endpoints
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/me
PATCH /api/auth/me
POST /api/auth/change-password
POST /api/auth/verify-email
```

### 4. Создать модуль Products

#### Entities
```typescript
// product.entity.ts
@Entity('products')
export class Product {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column('text')
  description: string;

  @Column()
  shortDescription: string;

  @Column({ unique: true })
  sku: string;

  @Column('decimal')
  price: number;

  @Column('decimal', { nullable: true })
  compareAtPrice?: number;

  @Column()
  categoryId: ObjectId;

  @Column('simple-array', { default: [] })
  tags: string[];

  @Column('json', { default: [] })
  images: ProductImage[];

  @Column('json', { default: [] })
  variants: ProductVariant[];

  @Column('json')
  attributes: ProductAttributes;

  @Column('decimal', { default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewsCount: number;

  @Column({ default: 0 })
  soldCount: number;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column('json')
  seo: SEO;

  @Column({ default: true })
  isVisible: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### Индексы MongoDB
```typescript
// В product.entity.ts добавить:
@Index(['slug'])
@Index(['categoryId'])
@Index(['status'])
@Index(['price'])
@Index(['createdAt'])
```

#### Query DTO
```typescript
// product-query.dto.ts
export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['price_asc', 'price_desc', 'newest', 'popular', 'rating'])
  sort?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sizes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activity?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  inStock?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
```

### 5. Создать модуль Categories

#### Entity
```typescript
@Entity('categories')
export class Category {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ nullable: true })
  parentId?: ObjectId;

  @Column({ default: 0 })
  order: number;

  @Column({ default: true })
  isActive: boolean;

  @Column('json', { nullable: true })
  seo?: SEO;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### Методы сервиса
- `findAll()` - плоский список
- `findTree()` - дерево категорий
- `findBySlug(slug)`
- `create(dto)`
- `update(id, dto)`
- `delete(id)`
- `reorder(items)`

### 6. Создать модуль Orders

#### Entities
```typescript
@Entity('orders')
export class Order {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  orderNumber: string; // SP-2024-000001

  @Column()
  userId: ObjectId;

  @Column('json')
  items: OrderItem[];

  @Column('decimal')
  subtotal: number;

  @Column('decimal', { default: 0 })
  discount: number;

  @Column('decimal')
  shipping: number;

  @Column('decimal')
  total: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column('json')
  shippingAddress: Address;

  @Column()
  shippingMethod: string;

  @Column()
  paymentMethod: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ nullable: true })
  promoCode?: string;

  @Column('decimal', { nullable: true })
  promoDiscount?: number;

  @Column({ nullable: true })
  customerNote?: string;

  @Column({ nullable: true })
  adminNote?: string;

  @Column('json', { default: [] })
  history: OrderHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### Генерация номера заказа
```typescript
private async generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await this.orderRepository.count({
    where: {
      orderNumber: new RegExp(`^SP-${year}-`),
    },
  });
  const number = String(count + 1).padStart(6, '0');
  return `SP-${year}-${number}`;
}
```

### 7. Создать модуль Cart

#### Entity
```typescript
@Entity('carts')
export class Cart {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ nullable: true })
  userId?: ObjectId;

  @Column({ nullable: true })
  sessionId?: string;

  @Column('json', { default: [] })
  items: CartItem[];

  @Column({ nullable: true })
  promoCode?: string;

  @Column('decimal', { nullable: true })
  promoDiscount?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  expiresAt: Date;
}
```

#### Методы
- `getCart(userId, sessionId)` - получить корзину
- `addItem(cartId, item)` - добавить товар
- `updateItem(cartId, variantId, quantity)` - обновить количество
- `removeItem(cartId, variantId)` - удалить товар
- `clear(cartId)` - очистить корзину
- `applyPromo(cartId, code)` - применить промокод
- `removePromo(cartId)` - удалить промокод
- `mergeGuestCart(userId, sessionId)` - слияние корзин

### 8. Создать модуль Reviews

#### Entity
```typescript
@Entity('reviews')
export class Review {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  productId: ObjectId;

  @Column()
  userId: ObjectId;

  @Column()
  orderId: ObjectId;

  @Column({ type: 'int' })
  rating: number; // 1-5

  @Column({ nullable: true })
  title?: string;

  @Column('text')
  text: string;

  @Column('simple-array', { default: [] })
  images: string[];

  @Column({ default: false })
  isApproved: boolean;

  @Column({ nullable: true })
  adminReply?: string;

  @Column({ nullable: true })
  adminReplyAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 9. Создать модуль Promotions

#### Entity
```typescript
@Entity('promotions')
export class Promotion {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: PromotionType })
  type: PromotionType;

  @Column('decimal')
  value: number;

  @Column('decimal', { nullable: true })
  minOrderAmount?: number;

  @Column('decimal', { nullable: true })
  maxDiscount?: number;

  @Column({ nullable: true })
  usageLimit?: number;

  @Column({ nullable: true })
  usageLimitPerUser?: number;

  @Column({ default: 0 })
  usedCount: number;

  @Column('simple-array', { default: [] })
  categoryIds: ObjectId[];

  @Column('simple-array', { default: [] })
  productIds: ObjectId[];

  @Column('simple-array', { default: [] })
  excludeProductIds: ObjectId[];

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 10. Создать модуль Upload (MinIO)

#### Service
```typescript
@Injectable()
export class UploadService {
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      endpoint: this.configService.get('s3.endpoint'),
      region: this.configService.get('s3.region'),
      credentials: {
        accessKeyId: this.configService.get('s3.accessKey'),
        secretAccessKey: this.configService.get('s3.secretKey'),
      },
      forcePathStyle: true,
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    // Обработка изображения через Sharp
    const processedImage = await sharp(file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const key = `images/${Date.now()}-${file.originalname}`;
    
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.configService.get('s3.bucket'),
        Key: key,
        Body: processedImage,
        ContentType: 'image/jpeg',
      }),
    );

    return `${this.configService.get('s3.endpoint')}/${this.configService.get('s3.bucket')}/${key}`;
  }

  async deleteImage(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.configService.get('s3.bucket'),
        Key: key,
      }),
    );
  }
}
```

### 11. Создать модуль Mail

#### Service с Handlebars шаблонами
```typescript
@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('mail.host'),
      port: this.configService.get('mail.port'),
      auth: {
        user: this.configService.get('mail.user'),
        pass: this.configService.get('mail.pass'),
      },
    });
  }

  async sendOrderConfirmation(order: Order, user: User): Promise<void> {
    const template = await this.compileTemplate('order-confirmation', {
      user,
      order,
    });

    await this.transporter.sendMail({
      from: this.configService.get('mail.from'),
      to: user.email,
      subject: `Заказ ${order.orderNumber} оформлен`,
      html: template,
    });
  }

  private async compileTemplate(name: string, data: any): Promise<string> {
    const templatePath = path.join(__dirname, 'templates', `${name}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);
    return template(data);
  }
}
```

### 12. Создать модуль Jobs (BullMQ)

#### Processors
```typescript
// email.processor.ts
@Processor('email')
export class EmailProcessor {
  constructor(private mailService: MailService) {}

  @Process('send-order-confirmation')
  async handleOrderConfirmation(job: Job<{ orderId: string }>) {
    // Отправка email
  }
}

// image.processor.ts
@Processor('image')
export class ImageProcessor {
  @Process('optimize')
  async handleImageOptimization(job: Job<{ imageUrl: string }>) {
    // Оптимизация изображения
  }
}
```

### 13. Создать Seed данные

```typescript
// src/database/seeds/seed.ts
async function seed() {
  // Подключение к БД
  const connection = await createConnection();

  // Очистка БД
  await connection.dropDatabase();

  // Создание категорий
  await seedCategories(connection);

  // Создание пользователей
  await seedUsers(connection);

  // Создание товаров
  await seedProducts(connection);

  await connection.close();
}
```

### 14. Создать main.ts и app.module.ts

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Глобальный префикс
  app.setGlobalPrefix(process.env.API_PREFIX || 'api');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(','),
    credentials: true,
  });

  // Helmet
  app.use(helmet());

  // Cookie parser
  app.use(cookieParser());

  // Валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Exception filters
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new MongoExceptionFilter(),
  );

  // Interceptors
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Sports Shop API')
    .setDescription('API для интернет-магазина спортивной одежды')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 4000);
}
bootstrap();
```

## 🔐 Безопасность

- ✅ Хеширование паролей (bcrypt, 12 rounds)
- ✅ JWT токены (access + refresh)
- ✅ HTTP-only cookies для refresh token
- ✅ Rate limiting (100 req/min)
- ✅ Helmet для HTTP заголовков
- ✅ CORS настройка
- ✅ Валидация всех входных данных
- ✅ Санитизация для NoSQL injection

## 📊 Кэширование

- Категории (TTL: 1 час)
- Популярные товары (TTL: 5 минут)
- Инвалидация при изменении данных

## 📝 Логирование

- Все HTTP запросы
- Ошибки с stack trace
- Структурированные логи (JSON)

## 🧪 Тестирование

```bash
# Unit тесты
npm run test

# E2E тесты
npm run test:e2e

# Coverage
npm run test:cov
```

## 🐳 Docker

```bash
# Запуск всех сервисов
docker-compose up -d

# Только инфраструктура
docker-compose up -d mongo redis minio

# Остановка
docker-compose down

# Остановка с удалением volumes
docker-compose down -v
```

## 📦 Production Build

```bash
# Build
npm run build

# Start production
npm run start:prod
```

## 🔗 Полезные ссылки

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Swagger/OpenAPI](https://swagger.io/)

## 📄 Лицензия

MIT