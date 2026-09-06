import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaConversationRepository as PrismaConversationRepositoryType } from './PrismaConversationRepository';

describe('PrismaConversationRepository (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: PrismaConversationRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaConversationRepository } = await import('./PrismaConversationRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaConversationRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('creates a conversation on first use and returns it unchanged on later lookups', async () => {
    const created = await repository.findOrCreate('user-1', 'conv-1');
    expect(created).toMatchObject({ id: 'conv-1', userId: 'user-1', messages: [] });

    const again = await repository.findOrCreate('user-1', 'conv-1');
    expect(again).toMatchObject({ id: 'conv-1', userId: 'user-1', messages: [] });
  });

  it('appends messages in order and returns them via findById', async () => {
    await repository.findOrCreate('user-2', 'conv-2');
    await repository.appendMessage('conv-2', 'user', 'How am I doing today?');
    await repository.appendMessage('conv-2', 'assistant', 'You are on track!');

    const conversation = await repository.findById('user-2', 'conv-2');

    expect(conversation?.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'How am I doing today?' },
      { role: 'assistant', content: 'You are on track!' },
    ]);
  });

  it('returns null from findById for a conversation owned by a different user', async () => {
    await repository.findOrCreate('user-3', 'conv-3');

    await expect(repository.findById('someone-else', 'conv-3')).resolves.toBeNull();
  });

  it('throws NotFoundError from findOrCreate when the id is already owned by a different user', async () => {
    await repository.findOrCreate('user-4', 'conv-4');

    await expect(repository.findOrCreate('someone-else', 'conv-4')).rejects.toThrow('Conversation was not found');
  });

  it('returns null from findById for an unknown conversation id', async () => {
    await expect(repository.findById('user-1', 'does-not-exist')).resolves.toBeNull();
  });

  it('lists a user\'s non-empty conversations newest-first with derived title/preview', async () => {
    await repository.findOrCreate('list-user', 'list-older');
    await repository.appendMessage('list-older', 'user', 'what should I eat for breakfast?');
    await repository.appendMessage('list-older', 'assistant', 'Greek yogurt with berries.');

    await new Promise((resolve) => setTimeout(resolve, 5));

    await repository.findOrCreate('list-user', 'list-newer');
    await repository.appendMessage('list-newer', 'user', 'log a coffee');

    await repository.findOrCreate('list-user', 'list-empty');

    const summaries = await repository.listByUser('list-user', 30);

    expect(summaries.map((s) => s.id)).toEqual(['list-newer', 'list-older']);
    expect(summaries[0]).toMatchObject({ title: 'log a coffee', messageCount: 1 });
    expect(summaries[1]).toMatchObject({
      title: 'what should I eat for breakfast?',
      preview: 'Greek yogurt with berries.',
      messageCount: 2,
    });
  });
});
