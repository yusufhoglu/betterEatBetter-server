import type { PrismaClient } from '@prisma/client';
import { publicName } from '../../../../shared/domain/personName';
import type { PersonSummary } from '../../domain/messagingTypes';
import type { PeopleDirectoryPort } from '../../ports/PeopleDirectoryPort';

/** Read-only projection of identity's users table (public profile fields only). */
export class PrismaPeopleDirectory implements PeopleDirectoryPort {
  constructor(private readonly db: PrismaClient) {}

  async getPeople(userIds: string[]): Promise<Map<string, PersonSummary>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const rows = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true, avatarUrl: true, email: true },
    });
    return new Map(
      rows.map((row) => [row.id, { userId: row.id, name: publicName(row), username: row.username, avatarUrl: row.avatarUrl }]),
    );
  }
}
