import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AdminReplyDto {
  @ApiProperty({ description: 'Admin reply text', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text: string;
}
