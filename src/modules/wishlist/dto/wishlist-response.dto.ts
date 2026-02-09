import { ApiProperty } from '@nestjs/swagger';

export class WishlistItemDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  price: number;

  @ApiProperty({ required: false })
  image?: string;

  @ApiProperty()
  inStock: boolean;
}

export class WishlistResponseDto {
  @ApiProperty({ type: [WishlistItemDto] })
  items: WishlistItemDto[];

  @ApiProperty()
  total: number;
}
