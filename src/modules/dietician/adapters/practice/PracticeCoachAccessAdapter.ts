import type { ResolveAiAssistant } from '../../../practice/use-cases/ResolveAiAssistant';
import type { CoachAccess, CoachAccessPort, CoachTurnPersona } from '../../ports/CoachAccessPort';

export class PracticeCoachAccessAdapter implements CoachAccessPort {
  constructor(private readonly resolveAiAssistant: ResolveAiAssistant) {}

  async checkAccess(userId: string): Promise<CoachAccess> {
    const status = await this.resolveAiAssistant.status(userId);
    switch (status.kind) {
      case 'none':
        return { kind: 'self' };
      case 'disabled':
        return { kind: 'unavailable', reason: 'disabled' };
      case 'assistant':
        return status.availableNow ? { kind: 'assistant' } : { kind: 'unavailable', reason: 'off_hours' };
    }
  }

  async personaForTurn(userId: string, message: string): Promise<CoachTurnPersona> {
    const turn = await this.resolveAiAssistant.forTurn(userId, message);
    return turn.kind === 'none' ? { kind: 'self' } : turn;
  }
}
