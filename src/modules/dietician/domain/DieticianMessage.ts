import type { MealLogProposal } from './MealLogProposal';
import type { MealRating } from './MealRating';
import type { Recipe } from './Recipe';

export type DieticianMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * `origin` distinguishes a message that came from a live request (`live`) from
 * one the dietician pushed on its own (`proactive` — a nudge). The mobile side
 * renders a proactive message with a "your dietician reached out" affordance.
 */
export type DieticianMessageOrigin = 'live' | 'proactive';

export interface DieticianMessage {
  id: string;
  conversationId: string;
  role: DieticianMessageRole;
  content: string;
  origin: DieticianMessageOrigin;
  proposal?: MealLogProposal;
  rating?: MealRating;
  recipe?: Recipe;
  createdAt: Date;
}
