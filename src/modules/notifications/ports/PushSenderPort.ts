import type { DevicePlatform } from '../domain/DeviceToken';

export interface PushMessage {
  token: string;
  platform: DevicePlatform;
  title: string;
  body: string;
  /** Extra key/value payload delivered to the app; values must be strings. */
  data?: Record<string, string>;
}

export type PushSendResult =
  /** Provider accepted the message. */
  | { status: 'sent' }
  /** Provider rejected the token as unregistered/invalid — the caller must delete the row. */
  | { status: 'invalid_token' }
  /** Transient or permanent send failure; `retryable` tells the caller whether another attempt is worthwhile. */
  | { status: 'error'; retryable: boolean; reason: string };

export interface PushSenderPort {
  send(message: PushMessage): Promise<PushSendResult>;
}
