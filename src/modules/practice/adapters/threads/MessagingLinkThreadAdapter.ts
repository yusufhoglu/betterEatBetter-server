import type { ThreadAdmin } from '../../../messaging/use-cases/ThreadAdmin';
import type { LinkThreadPort } from '../../ports/LinkThreadPort';

const KIND = 'dietitian_client' as const;

/** One messaging thread per dietitian-client link, addressed by link id. */
export class MessagingLinkThreadAdapter implements LinkThreadPort {
  constructor(private readonly threadAdmin: ThreadAdmin) {}

  ensureThreadForLink(linkId: string, participantIds: string[]): Promise<string> {
    return this.threadAdmin.ensureThread(KIND, linkId, participantIds);
  }

  findThreadIdForLink(linkId: string): Promise<string | null> {
    return this.threadAdmin.findThreadId(KIND, linkId);
  }

  closeThreadForLink(linkId: string, systemMessage: string): Promise<void> {
    return this.threadAdmin.close(KIND, linkId, systemMessage);
  }

  replaceParticipant(linkId: string, oldUserId: string, newUserId: string, systemMessage: string): Promise<void> {
    return this.threadAdmin.replaceParticipant(KIND, linkId, oldUserId, newUserId, systemMessage);
  }

  postSystemMessage(linkId: string, body: string): Promise<void> {
    return this.threadAdmin.postSystemMessage(KIND, linkId, body);
  }

  unansweredSince(linkId: string, clientId: string): Promise<Date | null> {
    return this.threadAdmin.unansweredSince(KIND, linkId, clientId);
  }
}
