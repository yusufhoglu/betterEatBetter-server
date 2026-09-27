import type { PersonSummary } from '../domain/messagingTypes';

export interface PeopleDirectoryPort {
  getPeople(userIds: string[]): Promise<Map<string, PersonSummary>>;
}
