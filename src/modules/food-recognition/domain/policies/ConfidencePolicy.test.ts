import { ConfidencePolicy } from './ConfidencePolicy';

describe('ConfidencePolicy', () => {
  describe('needsUserAction()', () => {
    it('returns false when Python/LLM reports sufficient confidence', () => {
      expect(ConfidencePolicy.needsUserAction('sufficient')).toBe(false);
    });

    it('returns true when Python/LLM reports insufficient_data', () => {
      expect(ConfidencePolicy.needsUserAction('insufficient_data')).toBe(true);
    });
  });
});
