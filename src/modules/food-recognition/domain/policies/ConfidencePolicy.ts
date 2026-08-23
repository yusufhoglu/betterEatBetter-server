/**
 * ConfidencePolicy — BINARY decision.
 *
 * Interprets the `status` field returned by Python RAG or the LLM estimator.
 * There is NO numeric threshold, no env-based config — the Python/LLM service
 * is responsible for deciding quality; this policy merely maps their verdict
 * to our domain boolean.
 */
export class ConfidencePolicy {
  /**
   * Returns true when the estimator signals the result is incomplete and the
   * user should fill in missing details before the entry is logged.
   */
  static needsUserAction(status: 'sufficient' | 'insufficient_data'): boolean {
    return status === 'insufficient_data';
  }
}
