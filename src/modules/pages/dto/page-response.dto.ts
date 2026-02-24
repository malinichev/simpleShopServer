import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PageResponseDto {
  @ApiProperty() _id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() metaTitle?: string;
  @ApiPropertyOptional() metaDescription?: string;
  @ApiProperty({ additionalProperties: true }) content: object;
  @ApiProperty() isPublished: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
