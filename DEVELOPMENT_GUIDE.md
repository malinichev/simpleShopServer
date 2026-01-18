# Руководство по разработке

## 📋 Текущий статус проекта

### ✅ Завершено

1. **Базовая конфигурация проекта**
   - ✅ package.json с зависимостями
   - ✅ TypeScript конфигурация (tsconfig.json, tsconfig.build.json)
   - ✅ ESLint и Prettier настройки
   - ✅ Docker конфигурация (Dockerfile, docker-compose.yml)
   - ✅ Environment файлы (.env.example, .env.development)

2. **Конфигурационные модули**
   - ✅ app.config.ts
   - ✅ database.config.ts
   - ✅ jwt.config.ts
   - ✅ redis.config.ts
   - ✅ s3.config.ts
   - ✅ mail.config.ts
   - ✅ throttle.config.ts
   - ✅ configuration.ts (главный файл конфигурации)

3. **Общие типы**
   - ✅ pagination.types.ts
   - ✅ response.types.ts

4. **Декораторы**
   - ✅ roles.decorator.ts
   - ✅ current-user.decorator.ts
   - ✅ api-paginated-response.decorator.ts

5. **Модули**
   - ✅ DatabaseModule (подключение к MongoDB)
   - ✅ HealthModule (health checks)

6. **Основные файлы**
   - ✅ main.ts (точка входа с Swagger)
   - ✅ app.module.ts (главный модуль)

### 🚧 Требуется реализация

## 1. Общие утилиты (common)

### Filters

#### http-exception.filter.ts
```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createErrorResponse } from '../types';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || 'Internal server error';

    const details =
      typeof exceptionResponse === 'object' && (exceptionResponse as any).details
        ? (exceptionResponse as any).details
        : undefined;

    const errorResponse = createErrorResponse(
      this.getErrorCode(status),
      Array.isArray(message) ? message[0] : message,
      request.url,
      details,
    );

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return codes[status] || 'UNKNOWN_ERROR';
  }
}
```

#### mongo-exception.filter.ts
```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { MongoError } from 'mongodb';
import { createErrorResponse } from '../types';

@Catch(MongoError)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: MongoError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';
    let code = 'DATABASE_ERROR';

    // Duplicate key error
    if (exception.code === 11000) {
      status = HttpStatus.CONFLICT;
      message = 'Resource already exists';
      code = 'DUPLICATE_KEY';
    }

    const errorResponse = createErrorResponse(code, message, request.url);

    response.status(status).json(errorResponse);
  }
}
```

### Guards

#### jwt-auth.guard.ts
```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
```

#### roles.guard.ts
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

### Interceptors

#### transform.interceptor.ts
```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { createSuccessResponse } from '../types';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // Если данные уже обернуты (например, пагинация), возвращаем как есть
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return createSuccessResponse(data);
      }),
    );
  }
}
```

#### logging.interceptor.ts
```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const delay = Date.now() - now;
        this.logger.log(
          `${method} ${url} ${response.statusCode} - ${delay}ms`,
        );
      }),
    );
  }
}
```

### Pipes

#### parse-object-id.pipe.ts
```typescript
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ObjectId } from 'mongodb';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, ObjectId> {
  transform(value: string): ObjectId {
    try {
      return new ObjectId(value);
    } catch (error) {
      throw new BadRequestException('Invalid ObjectId format');
    }
  }
}
```

## 2. Модуль Users

### Создать структуру:
```
/modules/users
├── /entities
│   └── user.entity.ts
├── /dto
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   └── user-response.dto.ts
├── users.module.ts
├── users.controller.ts
├── users.service.ts
└── users.repository.ts
```

### user.entity.ts
```typescript
import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';
import { UserRole } from '@/common/decorators/roles.decorator';

export interface Address {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  street: string;
  building: string;
  apartment?: string;
  postalCode: string;
  isDefault: boolean;
}

@Entity('users')
export class User {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

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

### users.service.ts (основные методы)
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    const hashedToken = refreshToken ? await bcrypt.hash(refreshToken, 12) : null;
    await this.usersRepository.update(userId, { refreshToken: hashedToken });
  }

  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }
}
```

## 3. Модуль Auth

### Создать JWT стратегии:

#### jwt.strategy.ts
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
```

#### jwt-refresh.strategy.ts
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.refreshToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const refreshToken = req.cookies?.refreshToken;
    const user = await this.usersService.findById(payload.sub);
    
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException();
    }

    const isValid = await this.usersService.validateRefreshToken(
      refreshToken,
      user.refreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
```

### auth.service.ts
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    const tokens = await this.generateTokens(user._id.toString());
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);
    
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user._id.toString());
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(userId: string) {
    const tokens = await this.generateTokens(userId);
    await this.usersService.updateRefreshToken(userId, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
  }

  private async generateTokens(userId: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: this.configService.get<string>('jwt.accessSecret'),
          expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { password, refreshToken, ...sanitized } = user;
    return sanitized;
  }
}
```

## 4. Следующие шаги

1. Реализовать все общие утилиты (filters, guards, interceptors, pipes)
2. Завершить модуль Users
3. Завершить модуль Auth
4. Создать модули Products, Categories, Orders, Cart и т.д. согласно README.md
5. Создать seed данные
6. Написать E2E тесты
7. Добавить логирование и мониторинг

## 5. Запуск проекта

```bash
# Установка зависимостей
npm install

# Запуск инфраструктуры
docker-compose up -d mongo redis minio

# Запуск в dev режиме
npm run start:dev
```

## 6. Полезные команды

```bash
# Генерация нового модуля
nest g module modules/module-name

# Генерация контроллера
nest g controller modules/module-name

# Генерация сервиса
nest g service modules/module-name

# Запуск тестов
npm run test

# Запуск E2E тестов
npm run test:e2e

# Линтинг
npm run lint

# Форматирование
npm run format
```

## 7. Структура ответов API

Все успешные ответы должны следовать формату:
```json
{
  "success": true,
  "data": { ... }
}
```

Пагинированные ответы:
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

Ошибки:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [...]
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/auth/register"
}
```

## 8. Безопасность

- Всегда хешировать пароли с bcrypt (12 rounds)
- Использовать HTTP-only cookies для refresh токенов
- Валидировать все входные данные
- Применять rate limiting
- Использовать Helmet для HTTP заголовков
- Настроить CORS правильно

## 9. Рекомендации

- Следовать принципам SOLID
- Использовать repository pattern
- Писать unit и E2E тесты
- Документировать API через Swagger
- Логировать все важные события
- Обрабатывать ошибки централизованно