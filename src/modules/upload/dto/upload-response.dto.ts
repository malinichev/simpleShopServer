import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({ description: 'Путь к файлу в S3', example: 'products/123/abc.webp' })
  key: string;

  @ApiProperty({ description: 'Полный URL файла' })
  url: string;

  @ApiPropertyOptional({ description: 'URL миниатюры' })
  thumbnailUrl?: string;

  @ApiProperty({ description: 'Размер файла в байтах' })
  size: number;

  @ApiProperty({ description: 'MIME-тип файла', example: 'image/webp' })
  mimeType: string;
}
