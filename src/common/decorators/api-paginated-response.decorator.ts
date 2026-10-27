import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination-meta.dto';

/**
 * Типизирует 200-ответ спискового эндпоинта как реальный конверт API:
 * `{ data: TModel[], meta: PaginationMeta }` (см. common/types/pagination.types.ts).
 * Фронты генерируют из этого типы/хуки (pnpm api:generate из корня).
 */
export const ApiPaginatedResponse = <TModel extends Type>(model: TModel) => {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
};
