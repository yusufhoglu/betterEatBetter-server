import type { IPolicy } from 'cockatiel';
import { env } from '../config/env';
import { buildResiliencePolicy, type ResiliencePolicyOptions } from '../resilience/policies';
import type { LlmClient } from './LlmClient';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { OpenAiProvider } from './providers/OpenAiProvider';
import type { LlmCompleteRequest, LlmCompleteResponse, LlmStreamCompleteRequest } from './types';

export type LlmProviderFactory = () => LlmClient;

const providerRegistry = new Map<string, LlmProviderFactory>();

/**
 * Registers a provider under a name usable via `LLM_PROVIDER` /
 * `createLlmClient({ provider })`. Adding a new provider (e.g. DeepSeek) is
 * exactly one new `providers/xProvider.ts` file plus one registration call —
 * no other file in this layer changes.
 */
export function registerLlmProvider(name: string, factory: LlmProviderFactory): void {
  providerRegistry.set(name, factory);
}

registerLlmProvider('openai', () => {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }
  return new OpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
});

registerLlmProvider('anthropic', () => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
  }
  return new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
});

export interface CreateLlmClientOptions {
  /** Overrides `LLM_PROVIDER`. Mainly for tests. */
  readonly provider?: string;
  readonly resilience?: Partial<ResiliencePolicyOptions>;
}

const DEFAULT_RESILIENCE_OPTIONS: ResiliencePolicyOptions = { timeoutMs: 60_000 };

export function createLlmClient(options: CreateLlmClientOptions = {}): LlmClient {
  const providerName = options.provider ?? env.LLM_PROVIDER ?? DEFAULT_PROVIDER;
  const factory = providerRegistry.get(providerName);
  if (!factory) {
    throw new Error(`Unknown LLM_PROVIDER: ${providerName}`);
  }

  const rawClient = factory();
  const policy = buildResiliencePolicy({ ...DEFAULT_RESILIENCE_OPTIONS, ...options.resilience });
  return new ResilientLlmClient(rawClient, policy);
}

/**
 * Wraps a raw provider with the shared cockatiel resilience policy — every
 * outbound LLM call is a "dış entegrasyon". `llm_tokens_total` is recorded by
 * each provider itself (not here), since `streamComplete()` only learns usage
 * once the stream ends and the canonical signature yields text, not usage.
 *
 * Note on `streamComplete`: cockatiel policies wrap promises, not streams.
 * The policy here only covers the synchronous hand-off to the underlying
 * async generator — timeout/circuit-breaker/retry protect stream *creation*,
 * not a failure mid-stream (retrying a partially-yielded stream isn't safe).
 */
class ResilientLlmClient implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly policy: IPolicy,
  ) {}

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    return this.policy.execute(() => this.inner.complete(request));
  }

  async *streamComplete(request: LlmStreamCompleteRequest): AsyncIterable<string> {
    const stream = await this.policy.execute(() => Promise.resolve(this.inner.streamComplete(request)));
    yield* stream;
  }
}
