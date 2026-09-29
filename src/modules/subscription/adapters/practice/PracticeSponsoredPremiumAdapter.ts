import type { IsManagedClient } from '../../../practice/use-cases/IsManagedClient';
import type { SponsoredPremiumPort } from '../../ports/SponsoredPremiumPort';

/** A client with an active dietitian is premium for as long as the link lasts. */
export class PracticeSponsoredPremiumAdapter implements SponsoredPremiumPort {
  constructor(private readonly isManagedClient: IsManagedClient) {}

  isSponsored(userId: string): Promise<boolean> {
    return this.isManagedClient.execute(userId);
  }
}
