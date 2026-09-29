import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import type { CoachUnavailableReason } from '../ports/CoachAccessPort';

/**
 * A dietitian's client the AI may not answer. `disabled` keeps the code the
 * apps already handle (hide the coach); `off_hours` means "come back later" —
 * the client app reads when from `GET /practice/me/link` → `aiAssistant`.
 */
export function coachUnavailableError(reason: CoachUnavailableReason): ForbiddenError {
  return reason === 'off_hours'
    ? new ForbiddenError('DIETITIAN_AI_OFF_HOURS', "Your dietitian's AI assistant is not available right now")
    : new ForbiddenError(
        'AI_COACH_UNAVAILABLE_MANAGED_CLIENT',
        'The AI coach is not available while you work with a dietitian',
      );
}
