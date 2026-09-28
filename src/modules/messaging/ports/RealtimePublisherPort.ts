import type { RealtimeEvent } from '../domain/messagingTypes';

/** Fan-out to every open realtime connection of the given users, on any instance. Best-effort. */
export interface RealtimePublisherPort {
  publish(userIds: string[], event: RealtimeEvent): Promise<void>;
}
