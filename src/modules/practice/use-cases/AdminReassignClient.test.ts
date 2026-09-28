import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { FakeLinkThreads } from '../test-utils/fakes/FakeLinkThreads';
import { InMemoryPracticeRepository } from '../test-utils/fakes/InMemoryPracticeRepository';
import { AdminReassignClient } from './AdminReassignClient';
import { ClientAccessPolicy } from './ClientAccessPolicy';

const now = new Date('2026-09-29T10:00:00.000Z');

async function setup() {
  const repository = new InMemoryPracticeRepository();
  const threads = new FakeLinkThreads();
  repository.addDietitian('dyt-a', 'solo-a', 'owner', 'key-a');
  repository.addDietitian('dyt-b', 'solo-b', 'owner', 'key-b');
  repository.addPerson('dyt-b', 'Ayşe');
  const link = await repository.createLink({
    organizationId: 'solo-a',
    dietitianId: 'dyt-a',
    clientId: 'client',
    consentScopes: ['meals'],
    now,
  });
  await threads.ensureThreadForLink(link.id, ['dyt-a', 'client']);
  return { repository, threads, link, useCase: new AdminReassignClient(repository, threads) };
}

describe('AdminReassignClient', () => {
  it('moves the link into the new dietitian’s organization and swaps the chat participant', async () => {
    const { repository, threads, link, useCase } = await setup();

    const result = await useCase.execute('client', 'dyt-b');

    expect(result.previousDietitianId).toBe('dyt-a');
    expect(result.link).toMatchObject({ dietitianId: 'dyt-b', organizationId: 'solo-b', consentScopes: ['meals'] });
    expect(threads.threads.get(link.id)?.participants).toEqual(['dyt-b', 'client']);
    expect(threads.threads.get(link.id)?.messages).toEqual(['Danışan Ayşe adlı diyetisyene devredildi.']);
    // The new dietitian can now read; the old one cannot.
    const policy = new ClientAccessPolicy(repository);
    await expect(policy.assertAssigned('dyt-b', 'client')).resolves.toMatchObject({ id: link.id });
    await expect(policy.assertAssigned('dyt-a', 'client')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a target who is not an active dietitian', async () => {
    const { repository, useCase } = await setup();
    repository.memberships.find((m) => m.userId === 'dyt-b')!.status = 'suspended';

    await expect(useCase.execute('client', 'dyt-b')).rejects.toBeInstanceOf(ValidationError);
    await expect(useCase.execute('client', 'nobody')).rejects.toBeInstanceOf(ValidationError);
  });

  it('404s when the client has no active dietitian', async () => {
    const { useCase } = await setup();
    await expect(useCase.execute('someone-else', 'dyt-b')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ClientAccessPolicy with a suspended dietitian', () => {
  it('denies the assigned dietitian once their membership is suspended', async () => {
    const { repository } = await setup();
    const policy = new ClientAccessPolicy(repository);
    await expect(policy.assertAssigned('dyt-a', 'client')).resolves.toBeDefined();

    repository.memberships.find((m) => m.userId === 'dyt-a')!.status = 'suspended';

    await expect(policy.assertAssigned('dyt-a', 'client')).rejects.toBeInstanceOf(NotFoundError);
  });
});
