import { ApiProperty } from '@nestjs/swagger';

export class FacetItemDto {
  @ApiProperty({ description: 'Нормализованное значение (для фильтра)' })
  value: string;

  @ApiProperty({ description: 'Отображаемая форма' })
  label: string;

  @ApiProperty({ description: 'HEX цвета — только для фасета colors', required: false })
  hex?: string;

  @ApiProperty({ description: 'Количество товаров / моделей под это значение' })
  count: number;
}

export class PriceRangeDto {
  @ApiProperty({ description: 'Минимальная цена в выборке' })
  min: number;

  @ApiProperty({ description: 'Максимальная цена в выборке' })
  max: number;
}

export class ProductFacetsDto {
  @ApiProperty({ type: [FacetItemDto] })
  colors: FacetItemDto[];

  @ApiProperty({ type: [FacetItemDto] })
  sizes: FacetItemDto[];

  @ApiProperty({ type: [FacetItemDto] })
  activities: FacetItemDto[];

  @ApiProperty({ type: PriceRangeDto })
  priceRange: PriceRangeDto;
}
