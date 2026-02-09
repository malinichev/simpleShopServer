import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UserBriefDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

export class ReviewResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  userId: string;

  @ApiPropertyOptional({ type: UserBriefDto })
  user?: UserBriefDto;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  rating: number;

  @ApiPropertyOptional()
  title?: string;

  @ApiProperty()
  text: string;

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty()
  isApproved: boolean;

  @ApiPropertyOptional()
  adminReply?: string;

  @ApiPropertyOptional()
  adminReplyAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
