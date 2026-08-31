export interface PushNotificationVerifierPort {
  /**
   * Verifies a Cloud Pub/Sub push request's signed OIDC bearer token.
   * Throws if the token is missing, malformed, or fails verification —
   * never returns a boolean, so a caller can't accidentally ignore a failure.
   */
  verify(authorizationHeader: string | undefined): Promise<void>;
}
