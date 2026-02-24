import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PagePublicResponseDto {
  @ApiProperty() slug: string;
  @ApiPropertyOptional() metaTitle?: string;
  @ApiPropertyOptional() metaDescription?: string;
  @ApiProperty({ additionalProperties: true }) content: object;
  @ApiProperty() isPublished: boolean;
}
