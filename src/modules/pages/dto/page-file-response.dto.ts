import { ApiProperty } from '@nestjs/swagger';

export class PageFileResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
  @ApiProperty() url: string;
  @ApiProperty() name: string;
  @ApiProperty() size: number;
  @ApiProperty() mimeType: string;
  @ApiProperty() createdAt: Date;
}
