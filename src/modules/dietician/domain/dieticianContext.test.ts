import { buildDieticianContextBlock } from './dieticianContext';
import type { ConversationDigest } from './ConversationDigest';
import type { DailySnapshot, PlanContext } from './dieticianContext';

const plan: PlanContext = {
  goal: 'lose',
  dailyCalories: 1800,
  proteinG: 140,
  carbsG: 160,
  fatG: 60,
  currentWeightKg: 82,
  targetWeightKg: 75,
  workoutsPerWeek: 3,
  age: 31,
  gender: 'male',
};

const snapshot: DailySnapshot = {
  date: '2026-09-03',
  consumedCalories: 1200,
  remainingCalories: 600,
  loggedMealTypes: ['breakfast', 'lunch'],
};

const digest: ConversationDigest = {
  goalsRecap: 'lose ~7kg',
  adviceGivenRecap: 'protein at breakfast',
  openThreads: 'trying oats',
  learnedPreferences: 'no fish',
};

describe('buildDieticianContextBlock', () => {
  it('returns null when there is nothing to inject', () => {
    expect(buildDieticianContextBlock({ plan: null, snapshot: null, digest: null })).toBeNull();
  });

  it('renders the plan block with goal and macro targets', () => {
    const block = buildDieticianContextBlock({ plan, snapshot: null, digest: null });
    expect(block).toContain('Goal: lose weight');
    expect(block).toContain('1800 kcal (140P / 160C / 60F g)');
    expect(block).toContain('target 75 kg');
  });

  it('renders today\'s snapshot with remaining calories and logged meals', () => {
    const block = buildDieticianContextBlock({ plan: null, snapshot, digest: null });
    expect(block).toContain('Today (2026-09-03):');
    expect(block).toContain('Consumed: 1200 kcal');
    expect(block).toContain('Remaining vs. target: 600 kcal');
    expect(block).toContain('Meals logged: breakfast, lunch');
  });

  it('notes when no meals are logged yet', () => {
    const block = buildDieticianContextBlock({
      plan: null,
      snapshot: { ...snapshot, loggedMealTypes: [] },
      digest: null,
    });
    expect(block).toContain('Meals logged: nothing yet');
  });

  it('appends the rolling digest when present', () => {
    const block = buildDieticianContextBlock({ plan, snapshot, digest });
    expect(block).toContain('Conversation so far (rolling summary):');
    expect(block).toContain('Known preferences: no fish');
  });
});
