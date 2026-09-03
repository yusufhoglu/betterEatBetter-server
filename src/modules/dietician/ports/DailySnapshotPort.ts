import type { DailySnapshot } from '../domain/dieticianContext';

export interface DailySnapshotPort {
  /** Today's intake vs. targets for the user's local day. null when unavailable. */
  getTodaySnapshot(userId: string, date: Date): Promise<DailySnapshot | null>;
}
