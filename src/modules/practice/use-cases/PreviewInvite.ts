import type { PersonSummary } from '../domain/practiceTypes';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { unknownPerson } from './GetPracticeMe';
import { resolveInvite } from './resolveInvite';

export interface InvitePreview {
  dietitian: PersonSummary & { title: string | null; specialties: string[] };
  organization: { id: string; name: string; kind: string };
  expiresAt: Date;
}

/** "You are about to connect with …" — shown before the client grants consent. */
export class PreviewInvite {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(code: string): Promise<InvitePreview> {
    const { membership, profile, expiresAt } = await resolveInvite(this.repository, code, this.secret, this.now());
    const person = (await this.repository.getPeople([membership.userId])).get(membership.userId);

    return {
      dietitian: { ...(person ?? unknownPerson(membership.userId)), title: profile.title, specialties: profile.specialties },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        kind: membership.organization.kind,
      },
      expiresAt,
    };
  }
}
