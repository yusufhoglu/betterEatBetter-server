import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { generateActivationCode, hashActivationCode } from '../../practice/domain/activationCode';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateActivationCodeInput {
  maxUses: number;
  /** null = never expires. */
  validityDays: number | null;
  note: string | null;
}

/**
 * Same codes as src/scripts/createActivationCode.ts (solo practice; clinics
 * stay a CLI concern). The plain code is returned once and never stored.
 */
export class ManageActivationCodes {
  constructor(
    private readonly repository: AdminRepositoryPort,
    private readonly clock: () => Date = () => new Date(),
    private readonly generate: () => string = generateActivationCode,
  ) {}

  async create(adminId: string, input: CreateActivationCodeInput): Promise<{ id: string; code: string; expiresAt: Date | null }> {
    if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 1000) {
      throw new ValidationError('INVALID_MAX_USES', 'maxUses must be between 1 and 1000');
    }
    const code = this.generate();
    const expiresAt = input.validityDays === null ? null : new Date(this.clock().getTime() + input.validityDays * DAY_MS);
    const note = input.note?.trim() || null;
    const { id } = await this.repository.createActivationCode({ codeHash: hashActivationCode(code), maxUses: input.maxUses, expiresAt, note });
    await this.repository.appendAudit({
      adminId,
      action: 'code.create',
      targetType: 'activation_code',
      targetId: id,
      details: { maxUses: input.maxUses, validityDays: input.validityDays, note },
    });
    return { id, code, expiresAt };
  }

  async revoke(adminId: string, id: string): Promise<void> {
    if (!(await this.repository.revokeActivationCode(id, this.clock()))) {
      throw new NotFoundError('CODE_NOT_FOUND', 'No active code with this id');
    }
    await this.repository.appendAudit({ adminId, action: 'code.revoke', targetType: 'activation_code', targetId: id });
  }
}
