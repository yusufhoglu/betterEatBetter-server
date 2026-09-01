/**
 * Provider-agnostic verification result. `externalId` is the identity's id in
 * whatever system verified it — for email+password that's the user's own DB
 * id; for a future Apple/Google adapter it would be the provider's subject id.
 */
export interface VerifiedIdentity {
  externalId: string;
  email: string;
}

export interface EmailPasswordCredentials {
  email: string;
  password: string;
}

/**
 * What a social provider (Google today, Apple later) receives: the OIDC ID
 * token the mobile client obtained from the provider SDK. The adapter verifies
 * it offline against the provider's public keys and returns a VerifiedIdentity
 * whose `externalId` is the provider's subject claim.
 */
export interface SocialIdTokenCredentials {
  idToken: string;
}

/**
 * Generic over the credential shape so email+password and future Apple/Google
 * adapters can each implement this with their own input type while use-cases
 * (SignIn, and later SignInWithProvider) depend only on `verify`.
 */
export interface IdentityProviderPort<TCredentials = EmailPasswordCredentials> {
  verify(credentials: TCredentials): Promise<VerifiedIdentity>;
}
