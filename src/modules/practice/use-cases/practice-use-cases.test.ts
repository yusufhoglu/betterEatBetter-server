import { ConflictError } from '../../../shared/errors/ConflictError';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { hashActivationCode } from '../domain/activationCode';
import { encodeInviteCode } from '../domain/inviteCode';
import type { ConsentScope } from '../domain/practiceTypes';
import { FakeClientData } from '../test-utils/fakes/FakeClientData';
import { FakeLinkThreads } from '../test-utils/fakes/FakeLinkThreads';
import { InMemoryAiAssistantRepository } from '../test-utils/fakes/InMemoryAiAssistantRepository';
import { InMemoryManagedClientCache } from '../test-utils/fakes/InMemoryManagedClientCache';
import { InMemoryPracticeRepository } from '../test-utils/fakes/InMemoryPracticeRepository';
import { ActivateDietitian } from './ActivateDietitian';
import { ClientAccessPolicy } from './ClientAccessPolicy';
import { ClientNotes } from './ClientNotes';
import { CreateInviteCode } from './CreateInviteCode';
import { EndLink } from './EndLink';
import { GetClientOverview } from './GetClientOverview';
import { GetMyAccessLog } from './GetMyAccessLog';
import { GetPracticeMe } from './GetPracticeMe';
import { IsManagedClient } from './IsManagedClient';
import { JoinDietitian } from './JoinDietitian';
import { ListClients } from './ListClients';
import { PreviewInvite } from './PreviewInvite';
import { ResolveAiAssistant } from './ResolveAiAssistant';
import { ReadClientData } from './ReadClientData';
import { ReassignClient } from './ReassignClient';
import { RotateInviteKey } from './RotateInviteKey';
import { SetClientPlan } from './SetClientPlan';
import { UpdateConsent } from './UpdateConsent';

const SECRET = 'test-invite-secret-test-invite-secret';
const now = new Date('2026-09-27T10:00:00.000Z');
const clock = () => now;
const today = new Date('2026-09-27T00:00:00.000Z');

function setup() {
  const repository = new InMemoryPracticeRepository();
  const threads = new FakeLinkThreads();
  const cache = new InMemoryManagedClientCache();
  const clientData = new FakeClientData();
  const policy = new ClientAccessPolicy(repository);

  repository.addOrganization({ id: 'clinic', name: 'Sağlıklı Yaşam Kliniği', kind: 'clinic' });
  repository.addDietitian('owner', 'clinic', 'owner', '00000001');
  repository.addDietitian('dyt-a', 'clinic', 'dietitian', '0000000a');
  repository.addDietitian('dyt-b', 'clinic', 'dietitian', '0000000b');
  for (const id of ['owner', 'dyt-a', 'dyt-b', 'client', 'stranger']) {
    repository.addPerson(id, `Name ${id}`);
  }

  const join = new JoinDietitian(repository, threads, cache, SECRET, clock);
  const inviteFor = (key: string) => encodeInviteCode(key, 7, SECRET, now).code;

  return {
    repository,
    threads,
    cache,
    clientData,
    policy,
    join,
    inviteFor,
    linkClient: (scopes: ConsentScope[] = ['meals', 'meal_photos', 'body_measurements', 'water']) =>
      join.execute({ clientId: 'client', code: inviteFor('0000000a'), consentScopes: scopes }),
  };
}

describe('ActivateDietitian', () => {
  it('creates a solo organization owned by the user for an unbound code', async () => {
    const { repository } = setup();
    repository.addCode({ id: 'code-1', codeHash: hashActivationCode('ABCD-EFGH-JKMN') });

    const result = await new ActivateDietitian(repository, clock).execute({ userId: 'client', code: 'abcd efgh jkmn' });

    expect(result.membership.role).toBe('owner');
    expect(result.membership.organization.kind).toBe('solo');
    expect(result.membership.organization.name).toBe('Name client');
    expect(await repository.findDietitianProfile('client')).not.toBeNull();
  });

  it('joins the bound clinic with the code role', async () => {
    const { repository } = setup();
    repository.addCode({ id: 'code-1', codeHash: hashActivationCode('AAAA'), organizationId: 'clinic', orgRole: 'admin' });

    const result = await new ActivateDietitian(repository, clock).execute({ userId: 'client', code: 'AAAA' });

    expect(result.membership.organizationId).toBe('clinic');
    expect(result.membership.role).toBe('admin');
  });

  it.each([
    ['unknown', {}],
    ['revoked', { revokedAt: new Date('2026-01-01') }],
    ['expired', { expiresAt: new Date('2026-09-01') }],
    ['used up', { usedCount: 1 }],
  ])('rejects a %s code', async (_label, overrides) => {
    const { repository } = setup();
    if (_label !== 'unknown') {
      repository.addCode({ id: 'code-1', codeHash: hashActivationCode('AAAA'), ...overrides });
    }

    await expect(new ActivateDietitian(repository, clock).execute({ userId: 'client', code: 'AAAA' })).rejects.toMatchObject({
      code: 'ACTIVATION_CODE_INVALID',
    });
  });

  it('refuses a second solo activation', async () => {
    const { repository } = setup();
    repository.addCode({ id: 'code-1', codeHash: hashActivationCode('AAAA') });

    await expect(new ActivateDietitian(repository, clock).execute({ userId: 'dyt-a', code: 'AAAA' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('invites & joining', () => {
  it('issues a code that previews and joins the right dietitian', async () => {
    const { repository, join, threads, cache } = setup();
    const issued = await new CreateInviteCode(repository, SECRET, 7, clock).execute({ dietitianId: 'dyt-a' });

    const preview = await new PreviewInvite(repository, SECRET, clock).execute(issued.code);
    expect(preview.dietitian.userId).toBe('dyt-a');
    expect(preview.organization.name).toBe('Sağlıklı Yaşam Kliniği');

    await cache.set('client', false);
    const link = await join.execute({ clientId: 'client', code: issued.code, consentScopes: ['meals', 'meals'] });

    expect(link.dietitianId).toBe('dyt-a');
    expect(link.consentScopes).toEqual(['meals']);
    expect(threads.threads.get(link.id)?.participants).toEqual(['dyt-a', 'client']);
    expect(await cache.get('client')).toBeNull();
  });

  it('rejects a second active dietitian and joining yourself', async () => {
    const { join, inviteFor, linkClient } = setup();
    await linkClient();

    await expect(
      join.execute({ clientId: 'client', code: inviteFor('0000000b'), consentScopes: [] }),
    ).rejects.toMatchObject({ code: 'CLIENT_ALREADY_LINKED' });
    await expect(
      join.execute({ clientId: 'dyt-b', code: inviteFor('0000000b'), consentScopes: [] }),
    ).rejects.toMatchObject({ code: 'CANNOT_JOIN_SELF' });
  });

  it('rotating the invite key revokes earlier codes', async () => {
    const { repository, join, inviteFor } = setup();
    const code = inviteFor('0000000a');

    await new RotateInviteKey(repository).execute('dyt-a');

    await expect(join.execute({ clientId: 'client', code, consentScopes: [] })).rejects.toMatchObject({
      code: 'INVITE_CODE_INVALID',
    });
  });

  it('rejects codes signed with another secret', async () => {
    const { join } = setup();
    const forged = encodeInviteCode('0000000a', 7, 'another-secret', now).code;

    await expect(join.execute({ clientId: 'client', code: forged, consentScopes: [] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('ClientAccessPolicy & client data', () => {
  it('lets the assigned dietitian read consented scopes and audits it', async () => {
    const { repository, clientData, policy, linkClient } = setup();
    await linkClient();
    const reader = new ReadClientData(clientData, policy);

    const days = await reader.getDays('dyt-a', 'client', new Date('2026-09-25'), today);

    expect(days.map((d) => d.date)).toEqual(['2026-09-27', '2026-09-26', '2026-09-25']);
    expect(days[0]!.meals[0]!.photoUrls).toHaveLength(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(repository.accessLog.map((e) => e.scope)).toEqual(['meals', 'meal_photos']);
  });

  it('strips photos when meal_photos is not shared', async () => {
    const { clientData, policy, linkClient } = setup();
    await linkClient(['meals']);

    const days = await new ReadClientData(clientData, policy).getDays('dyt-a', 'client', today, today);

    expect(days[0]!.meals[0]!.photoUrls).toEqual([]);
    expect(days[0]!.meals[0]!.entries[0]!.photoUrl).toBeNull();
  });

  it('blocks a scope the client switched off', async () => {
    const { repository, clientData, policy, linkClient } = setup();
    await linkClient();
    await new UpdateConsent(repository, clock).execute('client', ['meals']);

    await expect(new ReadClientData(clientData, policy).getWater('dyt-a', 'client', today, today)).rejects.toMatchObject({
      code: 'CONSENT_SCOPE_DISABLED',
    });
  });

  it('hides the client from other dietitians and denies data to the clinic owner', async () => {
    const { clientData, policy, linkClient } = setup();
    await linkClient();
    const reader = new ReadClientData(clientData, policy);

    await expect(reader.getDays('dyt-b', 'client', today, today)).rejects.toBeInstanceOf(NotFoundError);
    await expect(reader.getDays('stranger', 'client', today, today)).rejects.toBeInstanceOf(NotFoundError);
    await expect(reader.getDays('owner', 'client', today, today)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('shows the client their access log', async () => {
    const { repository, clientData, policy, linkClient } = setup();
    await linkClient();
    await new ReadClientData(clientData, policy).listBodyMeasurements('dyt-a', 'client', {});
    await new Promise((resolve) => setImmediate(resolve));

    const log = await new GetMyAccessLog(repository).execute('client', {});

    expect(log.items).toHaveLength(1);
    expect(log.items[0]).toMatchObject({ scope: 'body_measurements', actor: { userId: 'dyt-a' } });
  });
});

describe('roster', () => {
  it('shows activity only to the assigned dietitian and only for shared scopes', async () => {
    const { repository, clientData, policy, linkClient } = setup();
    await linkClient(['meals']);
    clientData.activity.set('client', {
      clientId: 'client',
      lastLoggedDate: '2026-09-26',
      daysLoggedLast7: 5,
      latestWeightKg: 79.5,
    });
    const listClients = new ListClients(repository, clientData, policy);

    const mine = await listClients.execute({ actorId: 'dyt-a', view: 'mine', today });
    expect(mine).toHaveLength(1);
    expect(mine[0]!.activity).toEqual({ lastLoggedDate: '2026-09-26', daysLoggedLast7: 5 });

    const clinic = await listClients.execute({ actorId: 'owner', view: 'organization', organizationId: 'clinic', today });
    expect(clinic).toHaveLength(1);
    expect(clinic[0]!.activity).toBeNull();

    await expect(
      listClients.execute({ actorId: 'dyt-b', view: 'organization', organizationId: 'clinic', today }),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_ADMIN_REQUIRED' });
  });

  it('filters by name', async () => {
    const { repository, clientData, policy, linkClient } = setup();
    await linkClient();
    const listClients = new ListClients(repository, clientData, policy);

    expect(await listClients.execute({ actorId: 'dyt-a', view: 'mine', query: 'CLIENT', today })).toHaveLength(1);
    expect(await listClients.execute({ actorId: 'dyt-a', view: 'mine', query: 'zzz', today })).toHaveLength(0);
  });

  it('overview includes plan and thread for the assigned dietitian only', async () => {
    const { repository, clientData, threads, policy, linkClient } = setup();
    await linkClient();
    const overview = new GetClientOverview(repository, clientData, threads, policy);

    expect((await overview.execute('dyt-a', 'client', today)).threadId).not.toBeNull();
    const ownerView = await overview.execute('owner', 'client', today);
    expect(ownerView).toMatchObject({ isAssigned: false, threadId: null, plan: null, activity: null });
  });
});

describe('plan, notes, reassignment and ending', () => {
  it('assigned dietitian sets the plan and the chat gets a system message', async () => {
    const { clientData, threads, policy, linkClient } = setup();
    const link = await linkClient();

    const plan = await new SetClientPlan(clientData, threads, policy).execute({
      dietitianId: 'dyt-a',
      clientId: 'client',
      dailyCalories: 1800,
      proteinG: 120,
      carbsG: 180,
      fatG: 60,
    });

    expect(plan.source).toBe('dietitian');
    expect(threads.threads.get(link.id)?.messages[0]).toContain('1800 kcal');
    await expect(
      new SetClientPlan(clientData, threads, policy).execute({
        dietitianId: 'owner',
        clientId: 'client',
        dailyCalories: 1800,
        proteinG: 120,
        carbsG: 180,
        fatG: 60,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ASSIGNED_DIETITIAN' });
  });

  it('notes are editable by their author only', async () => {
    const { repository, policy, linkClient } = setup();
    await linkClient();
    const notes = new ClientNotes(repository, policy);

    const note = await notes.create('dyt-a', 'client', 'Laktoz intoleransı var');
    expect(await notes.list('owner', 'client')).toHaveLength(1);
    await expect(notes.update('owner', 'client', note.id, 'x')).rejects.toMatchObject({ code: 'NOT_NOTE_AUTHOR' });

    await notes.remove('dyt-a', 'client', note.id);
    expect(await notes.list('dyt-a', 'client')).toHaveLength(0);
  });

  it('owner reassigns a client and the thread follows', async () => {
    const { repository, threads, policy, linkClient } = setup();
    const link = await linkClient();
    const reassign = new ReassignClient(repository, threads, policy);

    await expect(reassign.execute('dyt-a', 'client', 'dyt-b')).rejects.toMatchObject({
      code: 'ORGANIZATION_ADMIN_REQUIRED',
    });
    await expect(reassign.execute('owner', 'client', 'stranger')).rejects.toMatchObject({ code: 'INVALID_ASSIGNEE' });

    const updated = await reassign.execute('owner', 'client', 'dyt-b');
    expect(updated.dietitianId).toBe('dyt-b');
    expect(threads.threads.get(link.id)?.participants).toEqual(['dyt-b', 'client']);
  });

  it('client ends the link: plan released, thread read-only, AI coach back', async () => {
    const { repository, clientData, threads, cache, policy, linkClient } = setup();
    const link = await linkClient();
    const isManaged = new IsManagedClient(repository, cache);
    expect(await isManaged.execute('client')).toBe(true);

    await new EndLink(repository, policy, clientData, threads, cache, clock).byClient('client');

    expect(clientData.released).toEqual(['client']);
    expect(threads.threads.get(link.id)?.readOnly).toBe(true);
    expect(await isManaged.execute('client')).toBe(false);
    const ai = new ResolveAiAssistant(repository, new InMemoryAiAssistantRepository(), isManaged, clock);
    expect((await new GetPracticeMe(repository, threads, ai).execute('client')).link).toBeNull();
  });

  it('a stranger cannot end somebody else’s link', async () => {
    const { repository, clientData, threads, cache, policy, linkClient } = setup();
    await linkClient();

    await expect(
      new EndLink(repository, policy, clientData, threads, cache, clock).byStaff('dyt-b', 'client'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
