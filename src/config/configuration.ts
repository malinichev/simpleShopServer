const brandName = process.env.BRAND_NAME || 'My Shop';

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
  ],
  /** Базовый URL storefront для построения ссылок в письмах (verify, reset, etc) */
  webUrl: process.env.WEB_URL || 'http://localhost:3002',
  /** Имя бренда — используется в email-шаблонах и subject'ах. Override через BRAND_NAME env */
  brandName,

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'sports-shop',
  },

  /** Бэкапы БД: директория относительно cwd сервера и число хранимых файлов */
  backup: {
    dir: process.env.BACKUP_DIR || 'backups',
    retention: parseInt(process.env.BACKUP_RETENTION || '20', 10),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'sports-shop',
    region: process.env.S3_REGION || 'us-east-1',
  },

  mail: {
    /** Driver: 'smtp' (default) | 'resend' | 'console' (no real delivery, dev only) */
    driver: process.env.MAIL_DRIVER || 'smtp',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || `"${brandName}" <noreply@example.com>`,
    resendApiKey: process.env.RESEND_API_KEY || '',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  search: {
    /**
     * Search driver: 'postgres' (default, ILIKE без зависимостей) | 'meilisearch' (stub).
     * См. server/src/modules/search/drivers/.
     */
    driver: process.env.SEARCH_DRIVER || 'postgres',
    meilisearch: {
      host: process.env.MEILISEARCH_HOST || '',
      apiKey: process.env.MEILISEARCH_API_KEY || '',
    },
  },

  payments: {
    /**
     * Платёжные провайдеры. `manual` всегда активен. Прочие активируются,
     * когда заданы соответствующие credentials (условная регистрация
     * driver'ов — `payments/drivers/index.ts`).
     * `yookassa` — реальная интеграция; `stripe`/`cloudpayments` — stub'ы.
     */
    yookassa: {
      shopId: process.env.YOOKASSA_SHOP_ID || '',
      secretKey: process.env.YOOKASSA_SECRET_KEY || '',
      // Override боевого api.yookassa.ru — для локальной e2e-эмуляции
      // (см. e2e/src/mock-yookassa.mjs и e2e/README.md)
      apiUrl: process.env.YOOKASSA_API_URL || '',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
    cloudpayments: {
      publicId: process.env.CLOUDPAYMENTS_PUBLIC_ID || '',
      apiSecret: process.env.CLOUDPAYMENTS_API_SECRET || '',
    },
  },

  oauth: {
    stateSecret: process.env.OAUTH_STATE_SECRET || 'default-oauth-state-secret',
    stateExpiresIn: process.env.OAUTH_STATE_EXPIRES || '5m',
    successRedirect:
      process.env.OAUTH_SUCCESS_REDIRECT ||
      'http://localhost:3002/auth/callback',
    errorRedirect:
      process.env.OAUTH_ERROR_REDIRECT || 'http://localhost:3002/login',
    linkSuccessRedirect:
      process.env.OAUTH_LINK_SUCCESS_REDIRECT ||
      'http://localhost:3002/account/security',
    vk: {
      clientId: process.env.VK_CLIENT_ID || '',
      clientSecret: process.env.VK_CLIENT_SECRET || '',
      callbackUrl:
        process.env.VK_CALLBACK_URL ||
        'http://localhost:4000/api/auth/vk/callback',
    },
    yandex: {
      clientId: process.env.YANDEX_CLIENT_ID || '',
      clientSecret: process.env.YANDEX_CLIENT_SECRET || '',
      callbackUrl:
        process.env.YANDEX_CALLBACK_URL ||
        'http://localhost:4000/api/auth/yandex/callback',
    },
  },
});
