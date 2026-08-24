export interface SubscriptionRepositoryPort {
  findLatestByUserId(userId: string): Promise<{
    id: string;
    userId: string;
    productId: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null>;
  upsert(input: {
    userId: string;
    productId: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
  }): Promise<{
    id: string;
    userId: string;
    productId: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}
