import type { DataAccessLogEntry, PersonSummary } from '../domain/practiceTypes';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { unknownPerson } from './GetPracticeMe';

const MAX_LIMIT = 100;

/** Transparency for the client: who looked at which of their data, and when. */
export class GetMyAccessLog {
  constructor(private readonly repository: PracticeRepositoryPort) {}

  async execute(
    clientId: string,
    input: { limit?: number; before?: Date },
  ): Promise<{ items: Array<Omit<DataAccessLogEntry, 'subjectId'> & { actor: PersonSummary }>; nextBefore: string | null }> {
    const limit = Math.min(input.limit ?? 50, MAX_LIMIT);
    const entries = await this.repository.listAccessLog(clientId, limit, input.before);
    const people = await this.repository.getPeople([...new Set(entries.map((e) => e.actorId))]);

    return {
      items: entries.map(({ subjectId: _subjectId, ...entry }) => ({
        ...entry,
        actor: people.get(entry.actorId) ?? unknownPerson(entry.actorId),
      })),
      nextBefore: entries.length === limit ? entries[entries.length - 1]!.createdAt.toISOString() : null,
    };
  }
}
