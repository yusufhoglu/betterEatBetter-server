export interface SubscriptionRecord {
  id: string;
  userId: string;
  productId: string;
  provider: string;
  status: string;
  expiresAt: Date | null;
  purchaseToken: string | null;
  willRenew: boolean;
  inGracePeriod: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRepositoryPort {
  findLatestByUserId(userId: string): Promise<SubscriptionRecord | null>;
  findByPurchaseToken(purchaseToken: string): Promise<SubscriptionRecord | null>;
  upsert(input: {
    userId: string;
    productId: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
    purchaseToken: string | null;
    willRenew: boolean;
    inGracePeriod: boolean;
  }): Promise<SubscriptionRecord>;
  // Closes out the row for a purchaseToken that a newer purchase has
  // superseded (Google's linkedPurchaseToken — set on upgrade/downgrade/
  // resubscribe). No-ops if the token isn't found or isn't bound to
  // expectedUserId — a mismatch means it isn't actually this user's prior
  // purchase, so it must be left alone rather than "closed" on someone else's
  // say-so. Best-effort: never throws.
  supersede(input: { purchaseToken: string; expectedUserId: string }): Promise<void>;
}
