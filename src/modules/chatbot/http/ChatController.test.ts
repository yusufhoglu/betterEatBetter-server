import express from 'express';
import request from 'supertest';
import { DomainError } from '../../../shared/errors/DomainError';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import type { ChatStreamChunk } from '../domain/ChatStreamChunk';
import type { Conversation } from '../domain/Conversation';
import { ChatController } from './ChatController';

class FakeSendMessage {
  constructor(
    private readonly chunks: ChatStreamChunk[] = [],
    private readonly error?: Error,
  ) {}

  async *execute(): AsyncIterable<ChatStreamChunk> {
    for (const chunk of this.chunks) {
      yield chunk;
    }

    if (this.error) {
      throw this.error;
    }
  }
}

class FakeGetConversationHistory {
  constructor(private readonly conversation: Conversation) {}

  async execute(): Promise<Conversation> {
    return this.conversation;
  }
}

class FakeSeedPhotoMealProposal {
  async execute(): Promise<{ rawDescription: string; entries: [] }> {
    return { rawDescription: 'seeded photo estimate', entries: [] };
  }
}

class FakeConfirmMealProposal {
  async execute(): Promise<{ id: string }> {
    return { id: 'meal-item-1' };
  }
}

class FakeDomainError extends DomainError {
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 502) {
    super(code, message);
    this.httpStatus = httpStatus;
  }
}

function createApp(
  sendMessage: FakeSendMessage,
  conversation: Conversation = { id: 'conv-1', userId: 'user-1', createdAt: new Date(), messages: [] },
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { userId: 'user-1' };
    next();
  });

  const controller = new ChatController(
    sendMessage as never,
    new FakeGetConversationHistory(conversation) as never,
    new FakeSeedPhotoMealProposal() as never,
    new FakeConfirmMealProposal() as never,
  );

  app.post('/chat/:conversationId/messages', controller.handleSendMessage);
  app.get('/chat/:conversationId', controller.handleGetConversationHistory);
  app.post('/chat/:conversationId/proposals/photo', controller.handleSeedPhotoProposal);
  app.post('/chat/:conversationId/proposals/confirm', controller.handleConfirmMealProposal);
  app.use(errorMapperMiddleware);

  return app;
}

describe('ChatController', () => {
  it('streams proposal and text chunks as SSE events, then closes with done', async () => {
    const app = createApp(
      new FakeSendMessage([
        { type: 'proposal', proposal: { rawDescription: 'tavuklu sandvic', entries: [] } },
        { type: 'text', delta: 'Merhaba' },
        { type: 'text', delta: ' dunya' },
      ]),
    );

    const res = await request(app)
      .post('/chat/conv-1/messages')
      .set('x-trace-id', 'different-trace')
      .send({ content: 'selam' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-trace-id']).toBe('conv-1');
    expect(res.text).toContain('event: thinking');
    expect(res.text).toContain('event: proposal');
    expect(res.text).toContain('"rawDescription":"tavuklu sandvic"');
    expect(res.text).toContain('event: text');
    expect(res.text).toContain('"delta":"Merhaba"');
    expect(res.text).toContain('"delta":" dunya"');
    expect(res.text).toContain('event: done');
  });

  it('emits an SSE error event when streaming fails after headers are committed', async () => {
    const app = createApp(
      new FakeSendMessage(
        [{ type: 'text', delta: 'Parca' }],
        new FakeDomainError('STREAM_INTERRUPTED', 'The response stream was interrupted before completion'),
      ),
    );

    const res = await request(app)
      .post('/chat/conv-1/messages')
      .send({ content: 'selam' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: thinking');
    expect(res.text).toContain('event: text');
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('"code":"STREAM_INTERRUPTED"');
  });

  it('starts SSE immediately before the first chunk arrives', async () => {
    const app = createApp(
      new FakeSendMessage(
        [],
        new FakeDomainError('STREAM_INTERRUPTED', 'The response stream was interrupted before completion'),
      ),
    );

    const res = await request(app)
      .post('/chat/conv-1/messages')
      .send({ content: 'selam' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain(': connected');
    expect(res.text).toContain('event: thinking');
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('"code":"STREAM_INTERRUPTED"');
  });

  it('returns JSON validation errors before the stream starts', async () => {
    const app = createApp(new FakeSendMessage());

    const res = await request(app)
      .post('/chat/conv-1/messages')
      .send({ content: '' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST_BODY');
  });

  it('returns conversation history including proposal payloads', async () => {
    const app = createApp(
      new FakeSendMessage(),
      {
        id: 'conv-1',
        userId: 'user-1',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            role: 'assistant',
            content: '',
            proposal: { rawDescription: 'ayran', entries: [] },
            createdAt: new Date('2026-08-24T00:00:01.000Z'),
          },
        ],
      },
    );

    const res = await request(app).get('/chat/conv-1');

    expect(res.status).toBe(200);
    expect(res.body.messages[0].proposal).toEqual({ rawDescription: 'ayran', entries: [] });
  });

  it('seeds a photo-based proposal', async () => {
    const app = createApp(new FakeSendMessage());

    const res = await request(app)
      .post('/chat/conv-1/proposals/photo')
      .send({ mealPhotoId: 'photo-1' });

    expect(res.status).toBe(201);
    expect(res.body.proposal.rawDescription).toBe('seeded photo estimate');
  });

  it('confirms the latest proposal into a meal item', async () => {
    const app = createApp(new FakeSendMessage());

    const res = await request(app)
      .post('/chat/conv-1/proposals/confirm')
      .send({ mealType: 'lunch', timeZone: 'Europe/Istanbul', applyMode: 'append' });

    expect(res.status).toBe(201);
    expect(res.body.mealItem.id).toBe('meal-item-1');
  });
});
