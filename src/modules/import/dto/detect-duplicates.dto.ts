import { IsString, IsNotEmpty, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DetectDuplicatesDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @ApiProperty()
  @IsObject()
  mapping: Record<string, string>;
}
