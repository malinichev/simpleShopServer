import { IsEnum, IsOptional, IsUUID, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarkingCodeStatus } from '../entities/marking-code.entity';

export class UpdateMarkingStatusDto {
  @ApiProperty({ enum: MarkingCodeStatus })
  @IsEnum(MarkingCodeStatus)
  status: MarkingCodeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;
}

export class BulkUpdateMarkingStatusDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ enum: MarkingCodeStatus })
  @IsEnum(MarkingCodeStatus)
  status: MarkingCodeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
