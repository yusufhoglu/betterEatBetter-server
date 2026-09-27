import type { LinkThreadPort } from '../../ports/LinkThreadPort';

export class FakeLinkThreads implements LinkThreadPort {
  readonly threads = new Map<string, { id: string; participants: string[]; readOnly: boolean; messages: string[] }>();

  async ensureThreadForLink(linkId: string, participantIds: string[]): Promise<string> {
    const existing = this.threads.get(linkId);
    if (existing) {
      return existing.id;
    }
    const thread = { id: `thread-${linkId}`, participants: [...participantIds], readOnly: false, messages: [] };
    this.threads.set(linkId, thread);
    return thread.id;
  }

  async findThreadIdForLink(linkId: string): Promise<string | null> {
    return this.threads.get(linkId)?.id ?? null;
  }

  async closeThreadForLink(linkId: string, systemMessage: string): Promise<void> {
    const thread = this.threads.get(linkId);
    if (thread) {
      thread.readOnly = true;
      thread.messages.push(systemMessage);
    }
  }

  async replaceParticipant(linkId: string, oldUserId: string, newUserId: string, systemMessage: string): Promise<void> {
    const thread = this.threads.get(linkId);
    if (thread) {
      thread.participants = thread.participants.map((p) => (p === oldUserId ? newUserId : p));
      thread.messages.push(systemMessage);
    }
  }

  async postSystemMessage(linkId: string, body: string): Promise<void> {
    this.threads.get(linkId)?.messages.push(body);
  }
}
