import { Module } from '@nestjs/common';
import { ClientErrorsController } from './client-errors.controller';

/** Приёмник клиентских ошибок витрины (без БД — только в лог). */
@Module({
  controllers: [ClientErrorsController],
})
export class ClientErrorsModule {}
