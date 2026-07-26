#!/bin/bash
set -e

echo "=== 1. Очистка старых данных ==="
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d sports-shop -c "TRUNCATE \"product_variants\" CASCADE;"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d sports-shop -c "TRUNCATE \"products\" CASCADE;"
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d sports-shop -c "TRUNCATE \"categories\" CASCADE;"
echo "Очистка завершена."

echo "=== 2. Загрузка обработанных фото в локальный S3 (если ещё не сделано) ==="
echo "Уже должно быть сделано через process-and-upload.ts"

echo "=== 3. Создание категорий и товаров ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed 's|{S3_BASE}|http://localhost:9000/sports-shop|g' "$SCRIPT_DIR/create-products.sql" \
  | PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d sports-shop

echo "=== 4. Проверка ==="
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d sports-shop -c "SELECT c.name as category, COUNT(p.id) as products FROM categories c LEFT JOIN products p ON p.\"categoryId\" = c.id GROUP BY c.name ORDER BY c.name;"
echo ""
echo "Готово! Проверь http://localhost:4000/api/products"
