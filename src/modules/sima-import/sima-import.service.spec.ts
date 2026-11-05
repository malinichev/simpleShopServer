import type { Repository } from '@nestjs/common';
import { SimaImportService } from './sima-import.service';
import {
  SimaImportJob,
  SimaImportJobStatus,
} from './entities/sima-import-job.entity';

function makeService(job: Partial<SimaImportJob> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const jobsRepo = {
    // findOne отражает применённые update'ы (как реальная БД)
    findOne: jest.fn(async () => ({
      ...job,
      ...Object.assign({}, ...updates),
    })),
    find: jest.fn(async () => []),
    update: jest.fn(async (_id: string, data: Record<string, unknown>) => {
      updates.push(data);
      return { affected: 1 };
    }),
  };
  const service = new SimaImportService(
    jobsRepo as unknown as Repository<SimaImportJob>,
    { add: jest.fn() } as never, // queue
    { uploadBuffer: jest.fn(), getFileBuffer: jest.fn() } as never,
    { findBySkus: jest.fn(async () => []) } as never,
    { cachedLinks: jest.fn(async () => ({ keys: new Map(), colors: new Map() })) } as never,
  );
  return { service, updates, jobsRepo };
}

describe('SimaImportService.requestCancel', () => {
  it('живой задаче (прогресс свежий) ставит только флаг — воркер завершит сам', async () => {
    const { service, updates } = makeService({
      id: 'j1',
      status: SimaImportJobStatus.PROCESSING,
      updatedAt: new Date(Date.now() - 5_000),
    });
    const result = await service.requestCancel('j1');
    expect(updates).toEqual([{ cancelRequested: true }]);
    expect(result.status).toBe(SimaImportJobStatus.PROCESSING);
  });

  it('зависшей задаче (прогресс молчал > 90с) — принудительная отмена сразу', async () => {
    const { service, updates } = makeService({
      id: 'j2',
      status: SimaImportJobStatus.PROCESSING,
      updatedAt: new Date(Date.now() - 300_000),
    });
    const result = await service.requestCancel('j2');
    expect(updates[0]).toMatchObject({
      status: SimaImportJobStatus.CANCELED,
      finishedAt: expect.any(Date),
    });
    expect(result.status).toBe(SimaImportJobStatus.CANCELED);
  });

  it('завершённую задачу не трогает', async () => {
    const { service, updates } = makeService({
      id: 'j3',
      status: SimaImportJobStatus.COMPLETED,
    });
    await service.requestCancel('j3');
    expect(updates).toEqual([]);
  });
});

describe('SimaImportService.onModuleInit (жнец зомби)', () => {
  it('processing-задачи после рестарта помечаются failed с пояснением', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const jobsRepo = {
      findOne: jest.fn(),
      find: jest.fn(async () => [
        { id: 'z1', status: SimaImportJobStatus.PROCESSING, errorCount: 0, errors: [] },
      ]),
      update: jest.fn(async (_id: string, data: Record<string, unknown>) => {
        updates.push(data);
      }),
    };
    const service = new SimaImportService(
      jobsRepo as unknown as Repository<SimaImportJob>,
      { add: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.onModuleInit();
    expect(updates[0]).toMatchObject({ status: SimaImportJobStatus.FAILED });
    expect(JSON.stringify(updates[0].errors)).toContain('Воркер перезапущен');
  });
});
