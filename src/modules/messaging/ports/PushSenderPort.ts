/** Bridge to notifications.SendPushToUser. */
export interface ChatPushPort {
  send(input: { userId: string; title: string; body: string; data: Record<string, string> }): Promise<void>;
}
