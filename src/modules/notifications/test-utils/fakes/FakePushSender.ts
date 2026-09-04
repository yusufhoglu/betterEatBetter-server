import type { PushMessage, PushSenderPort, PushSendResult } from '../../ports/PushSenderPort';

/** Records every message and returns a scripted result keyed by token (default: sent). */
export class FakePushSender implements PushSenderPort {
  readonly sent: PushMessage[] = [];
  private readonly resultsByToken = new Map<string, PushSendResult>();

  scriptResult(token: string, result: PushSendResult): void {
    this.resultsByToken.set(token, result);
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    this.sent.push(message);
    return this.resultsByToken.get(message.token) ?? { status: 'sent' };
  }
}
