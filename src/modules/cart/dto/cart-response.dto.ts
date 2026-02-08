import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CartItemProductDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  image?: string;
}

export class CartItemVariantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  size: string;

  @ApiProperty()
  color: string;

  @ApiProperty()
  colorHex: string;
}

export class CartItemResponseDto {
  @ApiProperty({ type: CartItemProductDto })
  product: CartItemProductDto;

  @ApiProperty({ type: CartItemVariantDto })
  variant: CartItemVariantDto;

  @ApiProperty()
  variantId: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  price: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty()
  maxQuantity: number;

  @ApiProperty()
  addedAt: Date;
}

export class CartTotalsDto {
  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  discount: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  itemsCount: number;
}

export class CartResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty({ type: [CartItemResponseDto] })
  items: CartItemResponseDto[];

  @ApiPropertyOptional()
  promoCode?: string;

  @ApiPropertyOptional()
  promoDiscount?: number;

  @ApiProperty({ type: CartTotalsDto })
  totals: CartTotalsDto;
}
