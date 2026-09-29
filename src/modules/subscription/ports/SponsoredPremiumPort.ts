/**
 * Premium granted by someone else rather than bought in the store: today, a
 * client with an active dietitian (owned by the `practice` module). Lasts
 * exactly as long as the relationship.
 */
export interface SponsoredPremiumPort {
  isSponsored(userId: string): Promise<boolean>;
}
