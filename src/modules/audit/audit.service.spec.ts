import type { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditActorType, AuditLog } from './entities/audit-log.entity';

function makeRepo() {
  const create = jest.fn((data: Partial<AuditLog>) => data);
  const save = jest.fn().mockResolvedValue(undefined);
  const findAndCount = jest
    .fn()
    .mockResolvedValue([[{ id: 'a1' } as AuditLog], 1]);
  const repo = {
    create,
    save,
    findAndCount,
  } as unknown as Repository<AuditLog>;
  return { repo, create, save, findAndCount };
}

describe('AuditService', () => {
  it('записывает событие со всеми полями', async () => {
    const { repo, create, save } = makeRepo();
    const service = new AuditService(repo);

    await service.log({
      actorType: AuditActorType.ADMIN,
      actorId: 'admin-1',
      action: 'order.status_changed',
      entity: 'order',
      entityId: 'order-1',
      before: { status: 'pending' },
      after: { status: 'confirmed' },
      context: { requestId: 'req-1', ip: '127.0.0.1', userAgent: 'jest' },
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      actorType: 'admin',
      actorId: 'admin-1',
      action: 'order.status_changed',
      requestId: 'req-1',
      ip: '127.0.0.1',
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('ошибка записи аудита не роняет бизнес-операцию', async () => {
    const { repo, save } = makeRepo();
    save.mockRejectedValue(new Error('db down'));
    const service = new AuditService(repo);

    await expect(
      service.log({
        actorType: AuditActorType.SYSTEM,
        action: 'payment.status_changed',
        entity: 'order',
        entityId: 'order-2',
      }),
    ).resolves.toBeUndefined();
  });

  it('find: фильтры и пагинация уходят в репозиторий', async () => {
    const { repo, findAndCount } = makeRepo();
    const service = new AuditService(repo);

    const result = await service.find({
      entity: 'order',
      entityId: 'order-1',
      limit: 10,
      offset: 0,
    } as never);

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entity: 'order', entityId: 'order-1' },
        take: 10,
        skip: 0,
      }),
    );
    expect(result.total).toBe(1);
  });
});
