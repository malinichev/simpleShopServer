import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class RestoreBackupDto {
  @ApiPropertyOptional({
    description:
      'Восстановить также заказы (и ссылающиеся на них таблицы). ' +
      'false — текущие заказы сохраняются, остальная база возвращается к состоянию бэкапа',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeOrders?: boolean;
}

export class BackupItemDto {
  @ApiProperty({
    example: 'backup-20261028-120000.json.gz',
    description: 'Идентификатор бэкапа (имя файла)',
  })
  id: string;

  @ApiProperty({ example: '2026-10-28T12:00:00.032Z' })
  createdAt: string;

  @ApiProperty({ example: 1_048_576, description: 'Размер файла в байтах' })
  sizeBytes: number;

  @ApiProperty({ example: 25, description: 'Количество таблиц в дампе' })
  tableCount: number;

  @ApiProperty({ example: 3_245, description: 'Суммарное количество строк' })
  rowCount: number;
}

export class RestoreBackupResponseDto {
  @ApiProperty({ type: [String], description: 'Восстановленные таблицы' })
  restoredTables: string[];

  @ApiProperty({
    type: [String],
    description: 'Таблицы из дампа, отсутствующие в текущей схеме (пропущены)',
  })
  skippedTables: string[];

  @ApiProperty({
    type: [String],
    description:
      'Таблицы, не тронутые при includeOrders=false (заказы + ссылающиеся на них)',
  })
  excludedTables: string[];

  @ApiProperty({ example: 3_245 })
  restoredRows: number;

  @ApiProperty({
    example: 1,
    description: 'Главные администраторы, сохранённые поверх дампа',
  })
  keptSuperAdmins: number;

  @ApiProperty({
    example: 7,
    description: 'Текущие заказы, оставленные нетронутыми (includeOrders=false)',
  })
  currentOrdersKept: number;

  @ApiProperty({ example: 1_842 })
  durationMs: number;
}
