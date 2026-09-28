/**
 * The practice module's view of the messaging module: every dietitian-client
 * link gets exactly one chat thread. Adapter calls messaging's public
 * use-cases; practice never touches thread tables itself.
 */
export interface LinkThreadPort {
  /** Idempotent. Returns the thread id for the link. */
  ensureThreadForLink(linkId: string, participantIds: string[]): Promise<string>;
  findThreadIdForLink(linkId: string): Promise<string | null>;
  /** Link ended → thread becomes read-only; history is kept. */
  closeThreadForLink(linkId: string, systemMessage: string): Promise<void>;
  /** Reassignment: the new dietitian replaces the old one in the thread. */
  replaceParticipant(linkId: string, oldUserId: string, newUserId: string, systemMessage: string): Promise<void>;
  postSystemMessage(linkId: string, body: string): Promise<void>;
  /** When the oldest of the client's messages still waiting for a staff reply was sent; null if none. */
  unansweredSince(linkId: string, clientId: string): Promise<Date | null>;
}
