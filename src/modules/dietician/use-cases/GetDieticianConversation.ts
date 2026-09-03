import type { DieticianConversation } from '../domain/DieticianConversation';
import type { DailySnapshot, PlanContext } from '../domain/dieticianContext';
import type { DailySnapshotPort } from '../ports/DailySnapshotPort';
import type { DieticianConversationRepositoryPort } from '../ports/DieticianConversationRepositoryPort';
import type { PlanContextPort } from '../ports/PlanContextPort';

export interface DieticianConversationView {
  conversation: DieticianConversation;
  /** Drives the mobile screen header (goal, calories left today). */
  header: {
    plan: PlanContext | null;
    snapshot: DailySnapshot | null;
  };
}

export class GetDieticianConversation {
  constructor(
    private readonly repository: DieticianConversationRepositoryPort,
    private readonly planContextPort: PlanContextPort,
    private readonly dailySnapshotPort: DailySnapshotPort,
  ) {}

  async execute(userId: string, conversationId: string, today: Date): Promise<DieticianConversationView> {
    const [conversation, plan, snapshot] = await Promise.all([
      this.repository.findOrCreate(userId, conversationId),
      this.planContextPort.getPlanContext(userId).catch(() => null),
      this.dailySnapshotPort.getTodaySnapshot(userId, today).catch(() => null),
    ]);

    return { conversation, header: { plan, snapshot } };
  }
}
