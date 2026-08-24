import type { PrismaClient } from '@prisma/client';
import type { BodySilhouetteProfileRepositoryPort, UpdateBodySilhouetteProfileInput } from '../../ports/BodySilhouetteProfileRepositoryPort';

export class PrismaBodySilhouetteProfileRepository implements BodySilhouetteProfileRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string) {
    return this.db.bodySilhouetteProfile.findUnique({ where: { userId } });
  }

  async upsert(input: UpdateBodySilhouetteProfileInput) {
    return this.db.bodySilhouetteProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        neckCm: input.neckCm ?? null,
        shoulderCm: input.shoulderCm ?? null,
        waistCm: input.waistCm ?? null,
        hipCm: input.hipCm ?? null,
      },
      update: {
        neckCm: input.neckCm,
        shoulderCm: input.shoulderCm,
        waistCm: input.waistCm,
        hipCm: input.hipCm,
      },
    });
  }
}
