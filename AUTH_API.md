# Auth API Documentation

## Обзор

Модуль аутентификации предоставляет полный набор endpoints для управления пользователями и их сессиями.

## Базовый URL

```
http://localhost:4000/api/auth
```

## Endpoints

### 1. Регистрация

**POST** `/auth/register`

Регистрация нового пользователя.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "firstName": "Иван",
  "lastName": "Иванов"
}
```

**Response (201):**
```json
{
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов",
    "role": "customer",
    "isEmailVerified": false,
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Примечания:**
- Refresh token автоматически сохраняется в HTTP-only cookie
- Email верификация требуется для полного доступа

---

### 2. Вход

**POST** `/auth/login`

Аутентификация пользователя.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response (200):**
```json
{
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов",
    "role": "customer"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3. Выход

**POST** `/auth/logout`

Выход из системы (требует аутентификации).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "message": "Успешный выход из системы"
}
```

**Примечания:**
- Инвалидирует refresh token в БД
- Удаляет refresh token cookie

---

### 4. Обновление токенов

**POST** `/auth/refresh`

Получение новой пары токенов.

**Примечания:**
- Refresh token берётся из HTTP-only cookie автоматически
- Не требует Authorization header

**Response (200):**
```json
{
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "Иван",
    "lastName": "Иванов"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 5. Запрос сброса пароля

**POST** `/auth/forgot-password`

Отправка email с токеном для сброса пароля.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Если пользователь с таким email существует, на него будет отправлено письмо с инструкциями"
}
```

**Примечания:**
- Всегда возвращает успешный ответ (не раскрывает существование email)
- Токен действителен 1 час

---

### 6. Сброс пароля

**POST** `/auth/reset-password`

Установка нового пароля по токену.

**Request Body:**
```json
{
  "token": "a1b2c3d4e5f6...",
  "newPassword": "NewPassword123!"
}
```

**Response (200):**
```json
{
  "message": "Пароль успешно изменён"
}
```

**Примечания:**
- Инвалидирует все активные сессии пользователя

---

### 7. Подтверждение email

**POST** `/auth/verify-email`

Подтверждение email адреса.

**Request Body:**
```json
{
  "token": "a1b2c3d4e5f6..."
}
```

**Response (200):**
```json
{
  "message": "Email успешно подтверждён"
}
```

---

### 8. Получение профиля

**GET** `/auth/me`

Получение данных текущего пользователя (требует аутентификации).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "firstName": "Иван",
  "lastName": "Иванов",
  "phone": "+79001234567",
  "role": "customer",
  "avatar": "https://example.com/avatar.jpg",
  "addresses": [
    {
      "id": "addr_1",
      "title": "Дом",
      "city": "Москва",
      "street": "Ленина",
      "building": "10",
      "apartment": "5",
      "isDefault": true
    }
  ],
  "isEmailVerified": true,
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

---

### 9. Обновление профиля

**PATCH** `/auth/me`

Обновление данных профиля (требует аутентификации).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "firstName": "Пётр",
  "lastName": "Петров",
  "phone": "+79001234567"
}
```

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "firstName": "Пётр",
  "lastName": "Петров",
  "phone": "+79001234567",
  "role": "customer"
}
```

**Примечания:**
- Нельзя изменить: email, password, role, refreshToken

---

### 10. Смена пароля

**POST** `/auth/change-password`

Смена пароля для авторизованного пользователя.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

**Response (200):**
```json
{
  "message": "Пароль успешно изменён"
}
```

**Примечания:**
- Инвалидирует все активные сессии (кроме текущей)

---

## Коды ошибок

### 400 Bad Request
- Невалидные данные в запросе
- Недействительный или истёкший токен

### 401 Unauthorized
- Неверные учётные данные
- Отсутствует или недействителен access token
- Недействителен refresh token

### 403 Forbidden
- Недостаточно прав для выполнения действия

### 409 Conflict
- Пользователь с таким email уже существует

---

## Примеры использования

### JavaScript (Fetch API)

```javascript
// Регистрация
const register = async () => {
  const response = await fetch('http://localhost:4000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Важно для cookies
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'Password123!',
      firstName: 'Иван',
      lastName: 'Иванов',
    }),
  });
  
  const data = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  return data;
};

// Запрос с авторизацией
const getProfile = async () => {
  const token = localStorage.getItem('accessToken');
  
  const response = await fetch('http://localhost:4000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });
  
  return response.json();
};

// Обновление токенов
const refreshTokens = async () => {
  const response = await fetch('http://localhost:4000/api/auth/refresh', {
    method: 'POST',
    credentials: 'include', // Refresh token в cookie
  });
  
  const data = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  return data;
};
```

### Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000/api',
  withCredentials: true, // Для cookies
});

// Interceptor для автоматического добавления токена
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor для обновления токена при 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// Использование
const register = (userData) => api.post('/auth/register', userData);
const login = (credentials) => api.post('/auth/login', credentials);
const getProfile = () => api.get('/auth/me');
```

---

## Безопасность

### Access Token
- Срок жизни: 15 минут
- Хранится: localStorage или memory (рекомендуется)
- Передаётся: Authorization header

### Refresh Token
- Срок жизни: 7 дней
- Хранится: HTTP-only cookie (защита от XSS)
- Передаётся: автоматически через cookie

### Рекомендации
1. Используйте HTTPS в production
2. Храните access token в памяти, а не в localStorage (для максимальной безопасности)
3. Реализуйте автоматическое обновление токенов
4. Обрабатывайте ошибки 401 и перенаправляйте на login
5. Очищайте токены при logout

---

## Swagger документация

Полная интерактивная документация доступна по адресу:
```
http://localhost:4000/api/docs
```

Там вы можете:
- Просмотреть все endpoints
- Протестировать запросы
- Увидеть схемы данных
- Авторизоваться и тестировать защищённые endpoints