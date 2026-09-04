import { createModuleLogger } from '../../../shared/observability/logger';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';
import type { PushSenderPort } from '../ports/PushSenderPort';

const logger = createModuleLogger('notifications');

export interface SendPushToUserInput {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SendPushTally {
  sent: number;
  pruned: number;
  failed: number;
}

/**
 * Delivers one notification to every registered device of a user. Tokens the
 * provider reports as invalid are deleted so they aren't retried next time.
 * This is the single delivery path every scheduled job funnels through — it
 * does not itself consult notification preferences (callers do that).
 */
export class SendPushToUser {
  constructor(
    private readonly repository: DeviceTokenRepositoryPort,
    private readonly pushSender: PushSenderPort,
  ) {}

  async execute(input: SendPushToUserInput): Promise<SendPushTally> {
    const devices = await this.repository.listByUserId(input.userId);
    const tally: SendPushTally = { sent: 0, pruned: 0, failed: 0 };

    for (const device of devices) {
      const result = await this.pushSender.send({
        token: device.token,
        platform: device.platform,
        title: input.title,
        body: input.body,
        data: input.data,
      });

      if (result.status === 'sent') {
        tally.sent += 1;
      } else if (result.status === 'invalid_token') {
        await this.repository.deleteByToken(device.token);
        tally.pruned += 1;
      } else {
        tally.failed += 1;
        logger.warn(
          { userId: input.userId, platform: device.platform, reason: result.reason, retryable: result.retryable },
          'push delivery failed',
        );
      }
    }

    return tally;
  }
}
