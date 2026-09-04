import type { PushMessage, PushSenderPort, PushSendResult } from '../../ports/PushSenderPort';

/**
 * Fans one canonical {@link PushMessage} out to the right provider by
 * `platform`. Use-cases and jobs depend on this, never on the concrete
 * FCM / APNs adapters.
 */
export class PlatformRoutingPushSender implements PushSenderPort {
  constructor(
    private readonly fcm: PushSenderPort,
    private readonly apns: PushSenderPort,
  ) {}

  send(message: PushMessage): Promise<PushSendResult> {
    return message.platform === 'ios' ? this.apns.send(message) : this.fcm.send(message);
  }
}
