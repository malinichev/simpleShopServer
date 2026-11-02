/**
 * llms.txt на стороне API — точка входа для ИИ-агентов (стандарт llmstxt.org).
 * Отдаётся middleware в main.ts на GET /api/llms.txt (без авторизации).
 * Полная витринная версия для агентов живёт в client/public/llms.txt.
 */
export const AGENT_LLMS_TXT = `# Sports Shop API — api.svoybrand.shop

> Публичный read-only API каталога интернет-магазина SVOY BRAND (женская домашняя и спортивная одежда). JSON, авторизация не нужна. Витрина: https://svoybrand.shop

## Спецификация

- OpenAPI 3.0 (полная, машинно-читаемая): https://api.svoybrand.shop/api/openapi.json

## Основные эндпоинты (все — GET)

- Каталог: /api/products?page=&limit=&sort=&category=&sizes=&colors=&activity=&minPrice=&maxPrice=&inStock=&groupByModel=
- Карточка товара: /api/products/slug/{slug}
- Фасеты (цвета/размеры/цены): /api/products/facets
- Поиск: /api/products/search?q=
- Категории: /api/categories, /api/categories/tree
- CMS-страницы: /api/pages/{slug}

Цена — \`price\` (RUB), скидочная — \`compareAtPrice\`; наличие — \`variants[].stock > 0\`.

## Правила для агентов

- Только GET к перечисленным эндпоинтам каталога; mutating-эндпоинты требуют JWT пользователя и не предназначены для агентов.
- При 429 снизьте частоту запросов.
`;
