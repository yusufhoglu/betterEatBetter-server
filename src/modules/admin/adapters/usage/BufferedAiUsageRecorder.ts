import type { PrismaClient } from '@prisma/client';
import type { LlmUsageEvent } from '../../../../shared/llm/usageSink';
import { createModuleLogger } from '../../../../shared/observability/logger';

const logger = createModuleLogger('admin');

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BUFFER = 500;

/**
 * Collects LLM usage events in memory and writes them with one createMany per
 * flush, so an LLM call never waits on (or fails because of) accounting.
 * A crash can lose at most one flush interval of events — acceptable for
 * usage reporting, not for billing.
 */
export class BufferedAiUsageRecorder {
  private buffer: LlmUsageEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly db: Pick<PrismaClient, 'aiUsageEvent'>,
    private readonly flushIntervalMs = FLUSH_INTERVAL_MS,
  ) {}

  readonly record = (event: LlmUsageEvent): void => {
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BUFFER) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.flushIntervalMs);
      this.timer.unref();
    }
  };

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flushing;
    const batch = this.buffer;
    if (batch.length === 0) {
      return;
    }
    this.buffer = [];
    this.flushing = this.db.aiUsageEvent
      .createMany({
        data: batch.map((e) => ({
          userId: e.userId,
          feature: e.feature,
          provider: e.provider,
          model: e.model,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          createdAt: e.at,
        })),
      })
      .then(() => undefined)
      .catch((err: unknown) => {
        logger.error({ err, dropped: batch.length }, 'failed to write ai usage events');
      })
      .finally(() => {
        this.flushing = null;
      });
    await this.flushing;
  }
}
