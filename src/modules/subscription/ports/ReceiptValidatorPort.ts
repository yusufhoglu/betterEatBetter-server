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
    // Set when this purchase resulted from an upgrade/downgrade/resubscribe of
    // a prior subscription (Google's own linkedPurchaseToken) — the old token
    // this one supersedes, so callers can close out its row. Always null for
    // a first-time purchase, and always null from the Apple stub.
    linkedPurchaseToken: string | null;
  }>;
}
