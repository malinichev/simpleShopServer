import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PageFile } from '../entities/page.entity';

export class PageFileDto {
  @ApiProperty() key: string;
  @ApiProperty() url: string;
  @ApiProperty() name: string;
  @ApiProperty() size: number;
  @ApiProperty() mimeType: string;
  @ApiProperty() uploadedAt: Date;
}

export class PageResponseDto {
  @ApiProperty() _id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional() metaTitle?: string;
  @ApiPropertyOptional() metaDescription?: string;
  @ApiProperty({ additionalProperties: true }) content: object;
  @ApiProperty({ type: [PageFileDto] }) files: PageFile[];
  @ApiProperty() isPublished: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
