export interface ReceiptValidatorPort {
  validate(input: {
    productId: string;
    receiptToken: string;
    expiresAt?: Date | null;
  }): Promise<{
    productId: string;
    status: 'active' | 'trialing' | 'canceled';
    expiresAt: Date | null;
  }>;
}
