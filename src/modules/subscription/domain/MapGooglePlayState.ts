export type GooglePlaySubscriptionState =
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_PENDING';

export interface GooglePlaySubscriptionPurchase {
  subscriptionState: GooglePlaySubscriptionState | string;
  lineItems: Array<{
    productId?: string | null;
    expiryTime?: string | null;
    autoRenewingPlan?: { autoRenewEnabled?: boolean | null } | null;
  }>;
}

// A canceled subscription still has access until its expiryTime — the user
// turned off auto-renew, they didn't lose the period they already paid for.
// ON_HOLD/PAUSED/EXPIRED/PENDING have no current access regardless of
// expiryTime (ON_HOLD in particular can carry a past-due expiryTime while
// Google keeps retrying the payment).
const ENTITLED_STATES: ReadonlySet<string> = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
]);

export function MapGooglePlayState(purchase: GooglePlaySubscriptionPurchase): {
  status: 'active' | 'canceled';
  expiresAt: Date | null;
  willRenew: boolean;
  inGracePeriod: boolean;
  productId: string | null;
} {
  const status = ENTITLED_STATES.has(purchase.subscriptionState) ? 'active' : 'canceled';
  const inGracePeriod = purchase.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';

  // Base-plan subscriptions carry a single line item — take the first one.
  const primaryLineItem = purchase.lineItems[0];
  const willRenew = primaryLineItem?.autoRenewingPlan?.autoRenewEnabled ?? false;
  const productId = primaryLineItem?.productId ?? null;

  const expiryTimes = purchase.lineItems
    .map((item) => item.expiryTime)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime());

  const expiresAt = expiryTimes.length > 0 ? new Date(Math.max(...expiryTimes)) : null;

  return { status, expiresAt, willRenew, inGracePeriod, productId };
}
