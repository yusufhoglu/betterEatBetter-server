import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { RealtimeEvent } from '../domain/messagingTypes';
import { InMemoryThreadRepository } from '../test-utils/fakes/InMemoryThreadRepository';
import { CreateChatAttachmentUpload } from './CreateChatAttachmentUpload';
import { ListMessages } from './ListMessages';
import { ListThreads } from './ListThreads';
import { MarkThreadRead } from './MarkThreadRead';
import { SendMessage } from './SendMessage';
import { SendUnreadMessagePush } from './SendUnreadMessagePush';
import { ThreadAdmin } from './ThreadAdmin';

function setup() {
  const repository = new InMemoryThreadRepository();
  const published: Array<{ userIds: string[]; event: RealtimeEvent }> = [];
  const realtime = { publish: async (userIds: string[], event: RealtimeEvent) => void published.push({ userIds, event }) };
  const scheduled: Array<{ messageId: string; recipientId: string }> = [];
  const scheduler = { schedule: async (input: { messageId: string; recipientId: string }) => void scheduled.push(input) };
  const storage = {
    createUploadUrl: async (key: string) => `https://upload/${key}`,
    createDownloadUrl: async (key: string) => `https://download/${key}`,
  };
  const people = {
    getPeople: async (ids: string[]) =>
      new Map(ids.map((id) => [id, { userId: id, name: `Name ${id}`, username: null, avatarUrl: null }])),
  };
  const admin = new ThreadAdmin(repository, realtime, storage);
  const send = new SendMessage(repository, realtime, scheduler, storage);
  return { repository, published, scheduled, storage, people, admin, send, realtime };
}

async function withThread() {
  const ctx = setup();
  const threadId = await ctx.admin.ensureThread('dietitian_client', 'link-1', ['dyt', 'client']);
  return { ...ctx, threadId };
}

describe('messaging', () => {
  it('ensureThread is idempotent per ref', async () => {
    const { admin, threadId } = await withThread();
    expect(await admin.ensureThread('dietitian_client', 'link-1', ['dyt', 'client'])).toBe(threadId);
  });

  it('sends a message, fans out to everyone and schedules a push for the recipient only', async () => {
    const { send, threadId, published, scheduled } = await withThread();

    const { message, created } = await send.execute({
      senderId: 'client',
      threadId,
      clientMessageId: 'c-1',
      type: 'text',
      body: '  Merhaba hocam  ',
    });

    expect(created).toBe(true);
    expect(message.body).toBe('Merhaba hocam');
    expect(published[0]).toMatchObject({ userIds: ['dyt', 'client'], event: { type: 'message.created', threadId } });
    expect(scheduled).toEqual([{ messageId: message.id, recipientId: 'dyt' }]);
  });

  it('still schedules the push when the realtime publish fails', async () => {
    const { send, threadId, scheduled, realtime } = await withThread();
    realtime.publish = async () => {
      throw new Error('redis down');
    };

    const { message } = await send.execute({ senderId: 'dyt', threadId, clientMessageId: 'c-rt', type: 'text', body: 'Selam' });

    expect(scheduled).toEqual([{ messageId: message.id, recipientId: 'client' }]);
  });

  it('is idempotent on clientMessageId', async () => {
    const { send, threadId, published, repository } = await withThread();
    const input = { senderId: 'client', threadId, clientMessageId: 'c-1', type: 'text' as const, body: 'hi' };

    const first = await send.execute(input);
    const retry = await send.execute(input);

    expect(retry).toEqual({ message: first.message, created: false });
    expect(repository.messages).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it('rejects outsiders, read-only threads and foreign attachments', async () => {
    const { send, admin, threadId } = await withThread();

    await expect(
      send.execute({ senderId: 'stranger', threadId, clientMessageId: 'x', type: 'text', body: 'hi' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      send.execute({
        senderId: 'client',
        threadId,
        clientMessageId: 'x',
        type: 'image',
        attachments: [{ kind: 'image', key: 'users/dyt/chat/a.jpg', contentType: 'image/jpeg' }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ATTACHMENT' });

    await admin.close('dietitian_client', 'link-1', 'Bitti');
    await expect(
      send.execute({ senderId: 'client', threadId, clientMessageId: 'y', type: 'text', body: 'hi' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('closing keeps history and adds a system message', async () => {
    const { send, admin, repository, threadId, storage } = await withThread();
    await send.execute({ senderId: 'client', threadId, clientMessageId: 'c-1', type: 'text', body: 'hi' });

    await admin.close('dietitian_client', 'link-1', 'Danışan bağlantıyı sonlandırdı.');

    const page = await new ListMessages(repository, storage).execute('client', threadId, {});
    expect(page.readOnly).toBe(true);
    expect(page.items.map((m) => m.type)).toEqual(['system', 'text']);
  });

  it('paginates newest first with a cursor', async () => {
    const { send, repository, storage, threadId } = await withThread();
    for (let i = 0; i < 5; i++) {
      await send.execute({ senderId: 'client', threadId, clientMessageId: `c-${i}`, type: 'text', body: `m${i}` });
    }
    const list = new ListMessages(repository, storage);

    const first = await list.execute('dyt', threadId, { limit: 2 });
    const second = await list.execute('dyt', threadId, { limit: 2, before: first.nextBefore! });

    expect(first.items.map((m) => m.body)).toEqual(['m4', 'm3']);
    expect(second.items.map((m) => m.body)).toEqual(['m2', 'm1']);
  });

  it('tracks unread counts and read receipts', async () => {
    const { send, repository, storage, people, realtime, threadId } = await withThread();
    await send.execute({ senderId: 'client', threadId, clientMessageId: 'c-1', type: 'text', body: 'a' });
    const { message } = await send.execute({ senderId: 'client', threadId, clientMessageId: 'c-2', type: 'text', body: 'b' });
    const listThreads = new ListThreads(repository, people, storage);

    expect((await listThreads.execute('dyt'))[0]).toMatchObject({ unreadCount: 2, counterparts: [{ userId: 'client' }] });
    expect((await listThreads.execute('client'))[0]!.unreadCount).toBe(0);

    await new MarkThreadRead(repository, realtime).execute('dyt', threadId, message.id);

    expect((await listThreads.execute('dyt'))[0]!.unreadCount).toBe(0);
    const page = await new ListMessages(repository, storage).execute('client', threadId, {});
    expect(page.readReceipts[0]!.lastReadAt).toBe(message.createdAt);
  });

  it('pushes only messages that are still unread', async () => {
    const { send, repository, people, realtime, threadId } = await withThread();
    const pushes: string[] = [];
    const push = new SendUnreadMessagePush(repository, people, { send: async (i) => void pushes.push(i.body) });
    const { message } = await send.execute({ senderId: 'client', threadId, clientMessageId: 'c-1', type: 'text', body: 'Tartıldım: 79.5' });

    expect(await push.execute({ messageId: message.id, recipientId: 'dyt' })).toBe('sent');
    await new MarkThreadRead(repository, realtime).execute('dyt', threadId, message.id);
    expect(await push.execute({ messageId: message.id, recipientId: 'dyt' })).toBe('skipped');
    expect(pushes).toEqual(['Tartıldım: 79.5']);
  });

  it('issues upload URLs under the sender prefix only for supported images', async () => {
    const { repository, storage, threadId } = await withThread();
    const upload = new CreateChatAttachmentUpload(repository, storage);

    const result = await upload.execute('client', threadId, 'image/jpeg');
    expect(result.key).toMatch(new RegExp(`^users/client/chat/${threadId}/.+\\.jpg$`));
    await expect(upload.execute('client', threadId, 'application/pdf')).rejects.toMatchObject({
      code: 'UNSUPPORTED_CONTENT_TYPE',
    });
  });

  it('reassignment swaps the participant', async () => {
    const { admin, repository, threadId } = await withThread();

    await admin.replaceParticipant('dietitian_client', 'link-1', 'dyt', 'dyt-2', 'Devredildi');

    expect((await repository.listParticipants(threadId)).map((p) => p.userId).sort()).toEqual(['client', 'dyt-2']);
  });
});
