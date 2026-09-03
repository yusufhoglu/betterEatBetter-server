import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { ConversationDigest } from '../../domain/ConversationDigest';
import type { PrismaDieticianConversationRepository as RepoType } from './PrismaDieticianConversationRepository';

const DIGEST: ConversationDigest = {
  goalsRecap: 'lose ~7kg at 1800 kcal',
  adviceGivenRecap: 'higher-protein breakfasts',
  openThreads: 'user will try oats',
  learnedPreferences: 'dislikes fish',
};

describe('PrismaDieticianConversationRepository (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: RepoType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaDieticianConversationRepository } = await import('./PrismaDieticianConversationRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaDieticianConversationRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('creates a conversation on first use with a zero turn count and no digest', async () => {
    const created = await repository.findOrCreate('user-1', 'd-1');
    expect(created).toMatchObject({ id: 'd-1', userId: 'user-1', turnCount: 0, digest: null, digestTurn: 0, messages: [] });
  });

  it('appends messages in order, carrying the origin flag', async () => {
    await repository.findOrCreate('user-2', 'd-2');
    await repository.appendMessage('d-2', 'user', 'what should I eat?');
    await repository.appendMessage('d-2', 'assistant', 'A high-protein lunch.', 'live');
    await repository.appendMessage('d-2', 'assistant', 'You still have not logged dinner.', 'proactive');

    const conversation = await repository.findById('user-2', 'd-2');

    expect(conversation?.messages.map((m) => ({ role: m.role, content: m.content, origin: m.origin }))).toEqual([
      { role: 'user', content: 'what should I eat?', origin: 'live' },
      { role: 'assistant', content: 'A high-protein lunch.', origin: 'live' },
      { role: 'assistant', content: 'You still have not logged dinner.', origin: 'proactive' },
    ]);
  });

  it('increments the turn count and persists / reads back a digest', async () => {
    await repository.findOrCreate('user-3', 'd-3');

    expect(await repository.incrementTurnCount('d-3')).toBe(1);
    expect(await repository.incrementTurnCount('d-3')).toBe(2);

    await repository.saveDigest('d-3', DIGEST, 2);

    const conversation = await repository.findById('user-3', 'd-3');
    expect(conversation?.turnCount).toBe(2);
    expect(conversation?.digestTurn).toBe(2);
    expect(conversation?.digest).toEqual(DIGEST);
  });

  it('returns null from findById for a conversation owned by another user', async () => {
    await repository.findOrCreate('user-4', 'd-4');
    await expect(repository.findById('intruder', 'd-4')).resolves.toBeNull();
  });

  it('throws from findOrCreate when the id belongs to another user', async () => {
    await repository.findOrCreate('user-5', 'd-5');
    await expect(repository.findOrCreate('intruder', 'd-5')).rejects.toThrow('Conversation was not found');
  });
});
