import { addDays } from '../domain/analytics';
import { encodeInviteCode } from '../domain/inviteCode';
import type { ConsentScope } from '../domain/practiceTypes';
import { FakeClientData } from '../test-utils/fakes/FakeClientData';
import { FakeLinkThreads } from '../test-utils/fakes/FakeLinkThreads';
import { InMemoryManagedClientCache } from '../test-utils/fakes/InMemoryManagedClientCache';
import { InMemoryPracticeRepository } from '../test-utils/fakes/InMemoryPracticeRepository';
import { AlertRuleSettings } from './AlertRuleSettings';
import { ClientAccessPolicy } from './ClientAccessPolicy';
import { ClientInsightsService } from './ClientInsightsService';
import { GetClientAnalytics } from './GetClientAnalytics';
import { JoinDietitian } from './JoinDietitian';
import { ListClients } from './ListClients';
import { RefreshAllInsights } from './RefreshAllInsights';

const SECRET = 'test-invite-secret-test-invite-secret';
const today = new Date('2026-09-28T00:00:00.000Z');
const joinedAt = new Date('2026-08-01T10:00:00.000Z');

async function setup(scopes: ConsentScope[] = ['meals', 'body_measurements', 'water', 'steps']) {
  const repository = new InMemoryPracticeRepository();
  const threads = new FakeLinkThreads();
  const clientData = new FakeClientData();
  const policy = new ClientAccessPolicy(repository);
  repository.addDietitian('dyt', 'org', 'owner', '0000000a');
  repository.addPerson('client', 'Client');
  const join = new JoinDietitian(repository, threads, new InMemoryManagedClientCache(), SECRET, () => joinedAt);
  const link = await join.execute({ clientId: 'client', code: encodeInviteCode('0000000a', 7, SECRET, joinedAt).code, consentScopes: scopes });
  const insights = new ClientInsightsService(repository, clientData, threads, () => new Date('2026-09-28T12:00:00Z'));
  return { repository, threads, clientData, policy, insights, link };
}

describe('client analytics', () => {
  it('scores a model client 100 with no alerts', async () => {
    const { policy, insights, clientData } = await setup();
    clientData.weights = [
      { id: 'w1', metric: 'weight', value: 72, unit: 'kg', date: new Date('2026-09-01') },
      { id: 'w2', metric: 'weight', value: 71, unit: 'kg', date: new Date('2026-09-26') },
    ];

    const analytics = await new GetClientAnalytics(policy, insights).execute('dyt', 'client', 14, today);

    expect(analytics.period).toEqual({ from: '2026-09-15', to: '2026-09-28', days: 14 });
    expect(analytics.days).toHaveLength(14);
    expect(analytics.score.score).toBe(100);
    expect(analytics.alerts).toEqual([]);
    expect(analytics.weight).toMatchObject({ startKg: 72, latestKg: 71, targetKg: 70 });
    expect(analytics.measurements[0]).toMatchObject({ metric: 'weight', start: 72, latest: 71, change: -1 });
  });

  it('measures weight progress from the reading at the start of the relationship', async () => {
    const { policy, insights, clientData } = await setup();
    clientData.weights = [
      { id: 'w0', metric: 'weight', value: 75, unit: 'kg', date: new Date('2026-06-01') },
      { id: 'w1', metric: 'weight', value: 73, unit: 'kg', date: new Date('2026-07-20') },
      { id: 'w2', metric: 'weight', value: 71, unit: 'kg', date: new Date('2026-09-20') },
    ];

    const analytics = await new GetClientAnalytics(policy, insights).execute('dyt', 'client', 14, today);

    expect(analytics.weight).toMatchObject({ startKg: 73, changeKg: -2 });
    expect(analytics.weight!.points).toHaveLength(2);
    expect(analytics.measurements[0]).toMatchObject({ start: 73 });
  });

  it('never reads data the client does not share', async () => {
    const { policy, insights, clientData } = await setup(['meals']);

    const analytics = await new GetClientAnalytics(policy, insights).execute('dyt', 'client', 30, today);

    expect(clientData.selections.at(-1)).toEqual({ meals: true, water: false, steps: false, body: false });
    expect(analytics.weight).toBeNull();
    expect(analytics.activity).toBeNull();
    expect(analytics.score.parts.map((p) => p.id)).toEqual(['logging', 'calories', 'protein']);
  });

  it('surfaces alerts and caches them for the roster', async () => {
    const { repository, policy, insights, clientData, threads, link } = await setup();
    for (let i = 1; i <= 3; i++) {
      clientData.dayOverrides.set(addDays('2026-09-28', -i), { logged: false, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, mealTypes: [] });
    }
    clientData.dayOverrides.set('2026-09-28', { logged: false, kcal: 0 });
    threads.waiting.set(link.id, new Date('2026-09-27T06:00:00Z'));

    await new RefreshAllInsights(repository, insights, () => today).execute();
    const [row] = await new ListClients(repository, clientData, policy).execute({ actorId: 'dyt', view: 'mine', today });

    expect(row!.insight!.alerts.map((a) => a.ruleId)).toEqual(expect.arrayContaining(['no_logs', 'unanswered']));
    expect(row!.insight!.alerts[0]!.severity).toBe('high');
    expect(row!.insight!.score).toBeLessThan(100);
  });

  it('owners who are not assigned cannot see analytics', async () => {
    const { repository, policy, insights } = await setup();
    repository.addDietitian('owner2', 'org', 'owner', '0000000b');

    await expect(new GetClientAnalytics(policy, insights).execute('owner2', 'client', 14, today)).rejects.toMatchObject({
      code: 'NOT_ASSIGNED_DIETITIAN',
    });
  });
});

describe('alert rule settings', () => {
  it('merges overrides with defaults and re-evaluates', async () => {
    const { repository, insights } = await setup();
    const settings = new AlertRuleSettings(repository, insights, () => today);

    const updated = await settings.update('dyt', [
      { ruleId: 'steps_low', enabled: false, threshold: null },
      { ruleId: 'no_logs', enabled: true, threshold: 4 },
    ]);

    expect(updated.find((r) => r.id === 'steps_low')).toMatchObject({ enabled: false, customized: true });
    expect(updated.find((r) => r.id === 'no_logs')).toMatchObject({ threshold: 4, defaultThreshold: 2 });
    expect(updated.find((r) => r.id === 'water_low')).toMatchObject({ enabled: true, customized: false });
    await expect(settings.update('dyt', [{ ruleId: 'nope', enabled: true, threshold: null }])).rejects.toMatchObject({
      code: 'UNKNOWN_ALERT_RULE',
    });
    await expect(settings.list('client')).rejects.toMatchObject({ code: 'NOT_A_DIETITIAN' });
  });
});
