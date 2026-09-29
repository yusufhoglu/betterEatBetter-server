/**
 * Who the AI coach speaks as for a user — owned by the `practice` module.
 *
 * - `self`: no human dietitian; the regular eatBetter coach.
 * - `assistant`: a client whose dietitian opened their AI assistant; the coach
 *   answers in that dietitian's voice (`DietitianPersona`).
 * - `unavailable`: a dietitian's client the assistant must not answer — the
 *   dietitian has not opened it to them, or it is outside its hours.
 */
export interface DietitianPersona {
  dietitianId: string;
  dietitianName: string | null;
  assistantName: string;
  addressForm: 'sen' | 'siz' | null;
  tone: string | null;
  approach: string | null;
  rules: string[];
  avoid: string[];
  handoffMessage: string | null;
  /** The dietitian's private instructions for this one client. */
  clientInstructions: string | null;
  examples: Array<{ question: string; answer: string }>;
}

export type CoachUnavailableReason = 'disabled' | 'off_hours';

export type CoachAccess = { kind: 'self' } | { kind: 'assistant' } | { kind: 'unavailable'; reason: CoachUnavailableReason };

export type CoachTurnPersona =
  | { kind: 'self' }
  | { kind: 'assistant'; persona: DietitianPersona }
  | { kind: 'unavailable'; reason: CoachUnavailableReason };

export interface CoachAccessPort {
  checkAccess(userId: string): Promise<CoachAccess>;
  /** The persona for one turn, with the dietitian's examples ranked against `message`. */
  personaForTurn(userId: string, message: string): Promise<CoachTurnPersona>;
}
