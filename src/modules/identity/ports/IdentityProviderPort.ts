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
 * Generic over the credential shape so email+password and future Apple/Google
 * adapters can each implement this with their own input type while use-cases
 * (SignIn, and later SignInWithProvider) depend only on `verify`.
 */
export interface IdentityProviderPort<TCredentials = EmailPasswordCredentials> {
  verify(credentials: TCredentials): Promise<VerifiedIdentity>;
}
