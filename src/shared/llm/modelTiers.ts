import { env } from '../config/env';

/**
 * Two named model tiers, resolved to concrete provider model ids from env.
 *
 * - `cheap`  — mechanical work: intent classification, tool/data-gathering
 *              turns, history summarization. High volume, low stakes.
 * - `prime`  — the user-facing answer that benefits from a stronger model
 *              (e.g. dietician advice synthesis). Low volume, high stakes.
 *
 * Providers already honour a per-request `model` override
 * (`LlmCompleteRequest.model`), so a caller just resolves a tier and passes
 * the result through — no provider or client change needed.
 */
export type ModelTier = 'cheap' | 'prime';

export function resolveModel(tier: ModelTier): string {
  return tier === 'prime' ? env.LLM_MODEL_PRIME : env.LLM_MODEL_CHEAP;
}
