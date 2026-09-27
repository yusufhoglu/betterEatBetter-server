import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generateActivationCode, hashActivationCode } from '../modules/practice/domain/activationCode';
import { isOrganizationRole } from '../modules/practice/domain/practiceTypes';

/**
 * Admin tool: issues a dietitian activation code. The plain code is printed
 * ONCE — only its hash is stored. Ships compiled, like grantPremium.
 *
 * Usage:
 *   npm run practice:activation-code -- [--uses N] [--days N] [--note "..."]
 *        [--org <organizationId> [--role owner|admin|dietitian]]
 *        [--new-clinic "Clinic name"]   (creates the clinic; the code makes its first user owner)
 *   npm run practice:activation-code -- --revoke <code>
 *
 * Without --org / --new-clinic the redeemer gets their own solo practice.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInt(name: string, fallback: number | null): number | null {
  const raw = arg(name);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`--${name} must be a positive integer`);
  }
  return value;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const revoke = arg('revoke');
    if (revoke) {
      const result = await prisma.dietitianActivationCode.updateMany({
        where: { codeHash: hashActivationCode(revoke), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      console.log(result.count ? 'Code revoked.' : 'No active code matched.');
      return;
    }

    const maxUses = positiveInt('uses', 1)!;
    const days = positiveInt('days', 30);
    const newClinic = arg('new-clinic');
    let organizationId = arg('org') ?? null;
    let role = arg('role') ?? 'dietitian';

    if (newClinic) {
      organizationId = (await prisma.organization.create({ data: { name: newClinic, kind: 'clinic' } })).id;
      role = 'owner';
      console.log(`Created clinic "${newClinic}" (${organizationId})`);
    } else if (organizationId && !(await prisma.organization.findUnique({ where: { id: organizationId } }))) {
      throw new RangeError(`No organization ${organizationId}`);
    }
    if (!isOrganizationRole(role)) {
      throw new RangeError('--role must be owner, admin or dietitian');
    }

    const code = generateActivationCode();
    await prisma.dietitianActivationCode.create({
      data: {
        codeHash: hashActivationCode(code),
        organizationId,
        orgRole: role,
        maxUses,
        expiresAt: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null,
        note: arg('note') ?? null,
      },
    });

    console.log(`Activation code: ${code}`);
    console.log(
      `  uses: ${maxUses}, expires: ${days ? `${days} days` : 'never'}, ` +
        (organizationId ? `organization: ${organizationId} as ${role}` : 'solo practice'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
