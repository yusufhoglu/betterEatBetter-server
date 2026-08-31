export interface ReceiptValidatorPort {
  validate(input: {
    productId: string;
    receiptToken: string;
  }): Promise<{
    productId: string;
    status: 'active' | 'canceled';
    expiresAt: Date | null;
    willRenew: boolean;
    inGracePeriod: boolean;
  }>;
}
