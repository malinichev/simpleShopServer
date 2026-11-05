import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ExternalVisibilityDto {
  @ApiProperty({ description: 'true — скрыть отзыв с витрины, false — показать' })
  @IsBoolean()
  isHidden: boolean;
}
