import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Контракт-тесты: артефакт ../openapi.json — эталон, по которому фронты
 * генерируют типы и хуки (pnpm api:generate). Падение = контракт деградировал
 * (кто-то сломал DTO-декораторы или забыл перегенерировать после изменений).
 *
 * После изменения контракта: pnpm api:generate и обновить эти ожидания осознанно.
 */

const doc = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'openapi.json'), 'utf8'),
) as {
  paths: Record<string, Record<string, { responses: Record<string, ResponseDescriptor> }>>;
  components: { schemas: Record<string, { properties?: Record<string, SchemaDescriptor> }> };
};

interface SchemaDescriptor {
  type?: string;
  items?: { $ref?: string };
  $ref?: string;
}

interface ResponseDescriptor {
  content?: { 'application/json'?: { schema?: SchemaDescriptor } };
}

const schemaRef = (name: string) => `#/components/schemas/${name}`;

function okSchema(path: string, method: string): SchemaDescriptor {
  const response = doc.paths[path]?.[method]?.responses['200'];
  return response?.content?.['application/json']?.schema ?? {};
}

describe('OpenAPI-контракт (артефакт openapi.json)', () => {
  describe('ProductResponseDto', () => {
    it('объявляет requiresMarking (маркировка Честный ЗНАК)', () => {
      expect(
        doc.components.schemas.ProductResponseDto.properties?.requiresMarking
          ?.type,
      ).toBe('boolean');
    });

    it('colorSiblings — массив объектов ColorSiblingDto, не string[]', () => {
      const siblings =
        doc.components.schemas.ProductResponseDto.properties?.colorSiblings;
      expect(siblings?.type).toBe('array');
      expect(siblings?.items).toEqual({ $ref: schemaRef('ColorSiblingDto') });
    });
  });

  describe.each([
    ['/products', 'get', 'ProductResponseDto'],
    ['/orders', 'get', 'OrderResponseDto'],
    ['/users', 'get', 'UserResponseDto'],
    ['/users/{id}/orders', 'get', 'OrderResponseDto'],
    ['/reviews', 'get', 'ReviewResponseDto'],
    ['/products/{productId}/reviews', 'get', 'ReviewResponseDto'],
  ])('%s %s — конверт { data, meta }', (path, method, itemSchema) => {
    it(`data — ${itemSchema}[], meta — PaginationMetaDto`, () => {
      const schema = okSchema(path, method);
      expect(schema.properties?.data?.items).toEqual({
        $ref: schemaRef(itemSchema),
      });
      expect(schema.properties?.meta).toEqual({
        $ref: schemaRef('PaginationMetaDto'),
      });
    });
  });

  it('GET /products/{id}/siblings — ColorSiblingDto[]', () => {
    const schema = okSchema('/products/{id}/siblings', 'get');
    expect(schema.type).toBe('array');
    expect(schema.items).toEqual({ $ref: schemaRef('ColorSiblingDto') });
  });

  it('GET /auth/me — UserResponseDto', () => {
    expect(okSchema('/auth/me', 'get')).toEqual({
      $ref: schemaRef('UserResponseDto'),
    });
  });

  it('GET /settings/public — PublicSettingsDto', () => {
    expect(okSchema('/settings/public', 'get')).toEqual({
      $ref: schemaRef('PublicSettingsDto'),
    });
  });
});
