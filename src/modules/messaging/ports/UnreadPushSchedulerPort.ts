/**
 * "If the recipient still hasn't read this message in a little while, push
 * it." Delayed rather than immediate so an open chat doesn't buzz the phone.
 */
export interface UnreadPushSchedulerPort {
  schedule(input: { messageId: string; recipientId: string }): Promise<void>;
}
