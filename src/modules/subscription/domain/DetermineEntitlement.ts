export interface SubscriptionEntitlementInput {
  status: string;
  expiresAt: Date | null;
  now?: Date;
}

export function DetermineEntitlement(input: SubscriptionEntitlementInput): boolean {
  if (!['active', 'trialing'].includes(input.status)) {
    return false;
  }

  if (input.expiresAt === null) {
    return true;
  }

  return input.expiresAt.getTime() > (input.now ?? new Date()).getTime();
}
