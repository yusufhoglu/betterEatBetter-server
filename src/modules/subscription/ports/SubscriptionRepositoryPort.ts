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
}
