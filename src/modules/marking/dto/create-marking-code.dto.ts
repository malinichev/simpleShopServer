import { IsString, IsNotEmpty, IsUUID, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMarkingCodeDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiProperty({ example: '010460712345678921ABC123' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class BulkCreateMarkingCodesDto {
  @ApiProperty()
  @IsUUID()
  variantId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  codes: string[];
}
