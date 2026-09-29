import { ConflictError } from '../../../shared/errors/ConflictError';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { AI_LIMITS, type AssistantPersona } from '../domain/aiAssistant';
import { encodeInviteCode } from '../domain/inviteCode';
import type { ConsentScope } from '../domain/practiceTypes';
import type { AiTranscriptMessage, AiTranscriptPort, AiTranscriptSummary } from '../ports/AiTranscriptPort';
import type { AssistantPreviewPort, PreviewMessage } from '../ports/AssistantPreviewPort';
import { FakeLinkThreads } from '../test-utils/fakes/FakeLinkThreads';
import { InMemoryAiAssistantRepository } from '../test-utils/fakes/InMemoryAiAssistantRepository';
import { InMemoryManagedClientCache } from '../test-utils/fakes/InMemoryManagedClientCache';
import { InMemoryPracticeRepository } from '../test-utils/fakes/InMemoryPracticeRepository';
import { AiAssistantSettings, type AiSettingsInput } from './AiAssistantSettings';
import { ClientAccessPolicy } from './ClientAccessPolicy';
import { ClientAiAssistant } from './ClientAiAssistant';
import { GetMyLink } from './GetMyLink';
import { IsManagedClient } from './IsManagedClient';
import { JoinDietitian } from './JoinDietitian';
import { ResolveAiAssistant } from './ResolveAiAssistant';

const SECRET = 'test-invite-secret-test-invite-secret';
// Monday 2026-09-28 12:00 in Istanbul.
const now = new Date('2026-09-28T12:00:00+03:00');
const clock = () => now;

class FakeTranscripts implements AiTranscriptPort {
  readonly calls: Array<{ clientId: string; dietitianId: string; since: Date }> = [];
  conversations: AiTranscriptSummary[] = [];
  messages: AiTranscriptMessage[] | null = [];
  /** messageId → dietitian it was produced for */
  readonly assistantMessages = new Map<string, string>();

  async listConversations(clientId: string, dietitianId: string, since: Date): Promise<AiTranscriptSummary[]> {
    this.calls.push({ clientId, dietitianId, since });
    return this.conversations;
  }
  async getConversation(clientId: string, _conversationId: string, dietitianId: string, since: Date) {
    this.calls.push({ clientId, dietitianId, since });
    return this.messages;
  }
  async findAssistantMessage(messageId: string, dietitianId: string) {
    return this.assistantMessages.get(messageId) === dietitianId ? { id: messageId, content: 'reply' } : null;
  }
}

class FakePreview implements AssistantPreviewPort {
  readonly calls: Array<{ persona: AssistantPersona; messages: PreviewMessage[] }> = [];
  async reply(persona: AssistantPersona, messages: PreviewMessage[]): Promise<string> {
    this.calls.push({ persona, messages });
    return 'preview answer';
  }
}

const SETTINGS: AiSettingsInput = {
  enabled: true,
  defaultClientAccess: true,
  assistantName: null,
  addressForm: 'siz',
  tone: 'Samimi ve kısa.',
  approach: 'Yasak yiyecek yok.',
  rules: [' Her cevapta bir öneri ver. ', ''],
  avoid: ['Takviye önerme.'],
  handoffMessage: null,
  schedule: null,
};

function setup() {
  const repository = new InMemoryPracticeRepository();
  const aiRepository = new InMemoryAiAssistantRepository();
  const threads = new FakeLinkThreads();
  const cache = new InMemoryManagedClientCache();
  const policy = new ClientAccessPolicy(repository);
  const transcripts = new FakeTranscripts();
  const preview = new FakePreview();

  repository.addOrganization({ id: 'clinic', name: 'Klinik', kind: 'clinic' });
  repository.addDietitian('owner', 'clinic', 'owner', '00000001');
  repository.addDietitian('dyt-a', 'clinic', 'dietitian', '0000000a');
  for (const id of ['owner', 'dyt-a', 'client', 'loner']) {
    repository.addPerson(id, id === 'dyt-a' ? 'Ayşe Yılmaz' : `Name ${id}`);
  }

  const resolve = new ResolveAiAssistant(repository, aiRepository, new IsManagedClient(repository, cache), clock);
  const settings = new AiAssistantSettings(repository, aiRepository, transcripts, preview, clock);
  const clientAi = new ClientAiAssistant(aiRepository, transcripts, policy, clock);
  const join = new JoinDietitian(repository, threads, cache, SECRET, clock);

  return {
    repository,
    aiRepository,
    threads,
    transcripts,
    preview,
    resolve,
    settings,
    clientAi,
    linkClient: (scopes: ConsentScope[] = ['meals', 'ai_chat']) =>
      join.execute({
        clientId: 'client',
        code: encodeInviteCode('0000000a', 7, SECRET, now).code,
        consentScopes: scopes,
      }),
  };
}

describe('ResolveAiAssistant', () => {
  it('a user without a dietitian gets the regular coach', async () => {
    const { resolve } = setup();
    expect(await resolve.status('loner')).toEqual({ kind: 'none' });
    expect(await resolve.forTurn('loner', 'hi')).toEqual({ kind: 'none' });
  });

  it('is off for a dietitian client until the dietitian switches the assistant on', async () => {
    const { resolve, settings, linkClient } = setup();
    await linkClient();
    expect(await resolve.forTurn('client', 'hi')).toEqual({ kind: 'unavailable', reason: 'disabled' });

    await settings.update('dyt-a', SETTINGS);
    const turn = await resolve.forTurn('client', 'hi');
    expect(turn.kind).toBe('assistant');
  });

  it('builds the persona: name, cleaned rules, client instructions and ranked examples', async () => {
    const { resolve, settings, clientAi, linkClient } = setup();
    await linkClient();
    await settings.update('dyt-a', SETTINGS);
    await clientAi.update('dyt-a', 'client', { access: null, instructions: '  Laktoz intoleransı var. ' });
    await settings.createExample('dyt-a', { question: 'Kahvaltıda yumurta yiyebilir miyim?', answer: 'Evet, 2 tane.' });
    await settings.createExample('dyt-a', { question: 'Su ne kadar içmeliyim?', answer: '2-2,5 litre.' });

    const turn = await resolve.forTurn('client', 'yumurta kahvaltı');
    if (turn.kind !== 'assistant') throw new Error('expected assistant');
    expect(turn.persona).toMatchObject({
      dietitianId: 'dyt-a',
      dietitianName: 'Ayşe Yılmaz',
      assistantName: 'Ayşe Yılmaz · AI asistan',
      addressForm: 'siz',
      rules: ['Her cevapta bir öneri ver.'],
      clientInstructions: 'Laktoz intoleransı var.',
    });
    expect(turn.persona.examples[0]).toEqual({ question: 'Kahvaltıda yumurta yiyebilir miyim?', answer: 'Evet, 2 tane.' });
  });

  it('honours the per-client override in both directions', async () => {
    const { resolve, settings, clientAi, linkClient } = setup();
    await linkClient();
    await settings.update('dyt-a', SETTINGS);
    await clientAi.update('dyt-a', 'client', { access: 'off', instructions: null });
    expect((await resolve.status('client')).kind).toBe('disabled');

    await settings.update('dyt-a', { ...SETTINGS, defaultClientAccess: false });
    await clientAi.update('dyt-a', 'client', { access: 'on', instructions: null });
    expect((await resolve.status('client')).kind).toBe('assistant');
  });

  it('outside the schedule: unavailable now, with the next opening for the app', async () => {
    const { resolve, settings, repository, threads, linkClient } = setup();
    await linkClient();
    await settings.update('dyt-a', {
      ...SETTINGS,
      schedule: { timeZone: 'Europe/Istanbul', windows: [{ days: [1, 2, 3, 4, 5], start: '18:00', end: '09:00' }] },
    });

    expect(await resolve.forTurn('client', 'hi')).toEqual({ kind: 'unavailable', reason: 'off_hours' });
    const link = await new GetMyLink(repository, threads, resolve).execute('client');
    expect(link.aiAssistant).toEqual({
      enabled: true,
      availableNow: false,
      name: 'Ayşe Yılmaz · AI asistan',
      nextAvailableAt: new Date('2026-09-28T18:00:00+03:00'),
    });
  });

  it("a suspended dietitian's assistant stops answering", async () => {
    const { resolve, settings, repository, linkClient } = setup();
    await linkClient();
    await settings.update('dyt-a', SETTINGS);
    repository.memberships.find((m) => m.userId === 'dyt-a')!.status = 'suspended';
    expect(await resolve.forTurn('client', 'hi')).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });
});

describe('AiAssistantSettings', () => {
  it('returns defaults (off) before the dietitian saves anything, and only for dietitians', async () => {
    const { settings } = setup();
    expect(await settings.get('dyt-a')).toMatchObject({ enabled: false, exampleCount: 0, availableNow: false });
    await expect(settings.get('loner')).rejects.toMatchObject({ code: 'NOT_A_DIETITIAN' });
  });

  it('rejects an unknown time zone and bad schedule days', async () => {
    const { settings } = setup();
    await expect(
      settings.update('dyt-a', { ...SETTINGS, schedule: { timeZone: 'Mars/Olympus', windows: [] } }),
    ).rejects.toMatchObject({ code: 'INVALID_TIME_ZONE' });
    await expect(
      settings.update('dyt-a', {
        ...SETTINGS,
        schedule: { timeZone: 'Europe/Istanbul', windows: [{ days: [1, 1], start: '09:00', end: '17:00' }] },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps examples private to their author', async () => {
    const { settings, repository } = setup();
    repository.addDietitian('dyt-b', 'clinic', 'dietitian', '0000000b');
    const example = await settings.createExample('dyt-a', { question: 'q', answer: 'a' });

    await expect(settings.updateExample('dyt-b', example.id, { answer: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(settings.deleteExample('dyt-b', example.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await settings.listExamples('dyt-b')).toEqual([]);

    await settings.updateExample('dyt-a', example.id, { answer: 'better' });
    expect((await settings.listExamples('dyt-a'))[0]).toMatchObject({ answer: 'better', source: 'manual' });
  });

  it('a correction must point at a reply the assistant produced for this dietitian', async () => {
    const { settings, transcripts } = setup();
    transcripts.assistantMessages.set('11111111-1111-1111-1111-111111111111', 'dyt-a');
    transcripts.assistantMessages.set('22222222-2222-2222-2222-222222222222', 'someone-else');

    const correction = await settings.createExample('dyt-a', {
      question: 'q',
      answer: 'corrected',
      sourceMessageId: '11111111-1111-1111-1111-111111111111',
    });
    expect(correction).toMatchObject({ source: 'correction', sourceMessageId: '11111111-1111-1111-1111-111111111111' });

    await expect(
      settings.createExample('dyt-a', { question: 'q', answer: 'a', sourceMessageId: '22222222-2222-2222-2222-222222222222' }),
    ).rejects.toMatchObject({ code: 'AI_MESSAGE_NOT_FOUND' });
  });

  it('caps the number of examples', async () => {
    const { settings } = setup();
    for (let i = 0; i < AI_LIMITS.maxExamples; i++) {
      await settings.createExample('dyt-a', { question: `q${i}`, answer: 'a' });
    }
    await expect(settings.createExample('dyt-a', { question: 'one more', answer: 'a' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('preview uses the saved persona without any client instructions', async () => {
    const { settings, preview } = setup();
    await settings.update('dyt-a', SETTINGS);

    const result = await settings.previewReply('dyt-a', [{ role: 'user', content: 'Akşam ne yiyeyim?' }]);

    expect(result).toEqual({ reply: 'preview answer' });
    expect(preview.calls[0]!.persona).toMatchObject({ dietitianId: 'dyt-a', tone: 'Samimi ve kısa.', clientInstructions: null });
    await expect(
      settings.previewReply('dyt-a', [{ role: 'assistant', content: 'hi' }]),
    ).rejects.toMatchObject({ code: 'PREVIEW_NEEDS_USER_MESSAGE' });
  });
});

describe('ClientAiAssistant', () => {
  it('only the assigned dietitian manages a client’s assistant', async () => {
    const { clientAi, linkClient } = setup();
    await linkClient();
    // The clinic owner can see the client on the roster but not steer their AI.
    await expect(clientAi.update('owner', 'client', { access: 'on', instructions: null })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(clientAi.get('stranger', 'client')).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
  });

  it('reports the effective state from the master switch, default and override', async () => {
    const { clientAi, settings, linkClient } = setup();
    await linkClient();
    expect(await clientAi.get('dyt-a', 'client')).toEqual({
      access: null,
      instructions: null,
      enabled: false,
      availableNow: false,
    });
    await settings.update('dyt-a', SETTINGS);
    expect(await clientAi.update('dyt-a', 'client', { access: null, instructions: '  ' })).toEqual({
      access: null,
      instructions: null,
      enabled: true,
      availableNow: true,
    });
  });

  it('reading chats needs the ai_chat consent, is audited, and is scoped to this link and dietitian', async () => {
    const { clientAi, repository, transcripts, linkClient } = setup();
    const link = await linkClient(['meals']);
    await expect(clientAi.listConversations('dyt-a', 'client')).rejects.toMatchObject({ code: 'CONSENT_SCOPE_DISABLED' });

    await repository.updateConsent(link.id, ['meals', 'ai_chat'], now);
    await clientAi.listConversations('dyt-a', 'client');

    expect(transcripts.calls).toEqual([{ clientId: 'client', dietitianId: 'dyt-a', since: link.startedAt }]);
    // fire-and-forget audit
    await new Promise((resolve) => setImmediate(resolve));
    expect(repository.accessLog.some((e) => e.actorId === 'dyt-a' && e.scope === 'ai_chat')).toBe(true);
  });

  it('marks the replies the dietitian already corrected', async () => {
    const { clientAi, settings, transcripts, linkClient } = setup();
    await linkClient();
    const replyId = '33333333-3333-3333-3333-333333333333';
    transcripts.assistantMessages.set(replyId, 'dyt-a');
    transcripts.messages = [
      { id: 'u1', role: 'user', content: 'Tatlı yiyebilir miyim?', card: null, createdAt: now },
      { id: replyId, role: 'assistant', content: 'Hayır.', card: null, createdAt: now },
    ];
    const example = await settings.createExample('dyt-a', {
      question: 'Tatlı yiyebilir miyim?',
      answer: 'Haftada bir porsiyon olur.',
      sourceMessageId: replyId,
    });

    const messages = await clientAi.getConversation('dyt-a', 'client', 'conv-1');
    expect(messages.map((m) => m.correctionExampleId)).toEqual([null, example.id]);

    transcripts.messages = null;
    await expect(clientAi.getConversation('dyt-a', 'client', 'other')).rejects.toMatchObject({
      code: 'AI_CONVERSATION_NOT_FOUND',
    });
  });
});
