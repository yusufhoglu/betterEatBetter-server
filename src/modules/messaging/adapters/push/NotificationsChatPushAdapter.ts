import type { SendPushToUser } from '../../../notifications/use-cases/SendPushToUser';
import type { ChatPushPort } from '../../ports/PushSenderPort';

export class NotificationsChatPushAdapter implements ChatPushPort {
  constructor(private readonly sendPushToUser: SendPushToUser) {}

  async send(input: { userId: string; title: string; body: string; data: Record<string, string> }): Promise<void> {
    await this.sendPushToUser.execute(input);
  }
}
