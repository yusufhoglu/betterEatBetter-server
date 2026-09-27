import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { DietitianNote } from '../domain/practiceTypes';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

/**
 * Private notes on a client, visible to the practice staff who can see the
 * client (assigned dietitian, org owner/admin) and never to the client.
 * Notes belong to the link: a new relationship starts with a clean slate.
 * Only the author edits or deletes a note.
 */
export class ClientNotes {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly policy: ClientAccessPolicy,
  ) {}

  async list(actorId: string, clientId: string): Promise<DietitianNote[]> {
    const { link } = await this.policy.resolveStaffAccess(actorId, clientId);
    return this.repository.listNotes(link.id);
  }

  async create(actorId: string, clientId: string, body: string): Promise<DietitianNote> {
    const { link } = await this.policy.resolveStaffAccess(actorId, clientId);
    return this.repository.createNote(link.id, actorId, body);
  }

  async update(actorId: string, clientId: string, noteId: string, body: string): Promise<DietitianNote> {
    await this.requireOwnNote(actorId, clientId, noteId);
    return this.repository.updateNote(noteId, body);
  }

  async remove(actorId: string, clientId: string, noteId: string): Promise<void> {
    await this.requireOwnNote(actorId, clientId, noteId);
    await this.repository.deleteNote(noteId);
  }

  private async requireOwnNote(actorId: string, clientId: string, noteId: string): Promise<DietitianNote> {
    const { link } = await this.policy.resolveStaffAccess(actorId, clientId);
    const note = await this.repository.findNote(noteId);
    if (!note || note.linkId !== link.id) {
      throw new NotFoundError('NOTE_NOT_FOUND', 'Note not found');
    }
    if (note.authorId !== actorId) {
      throw new ForbiddenError('NOT_NOTE_AUTHOR', 'Only the author can change this note');
    }
    return note;
  }
}
