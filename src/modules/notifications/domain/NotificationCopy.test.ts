import { mealReminderContent, streakSaverContent, weeklyReportContent } from './NotificationCopy';

describe('NotificationCopy', () => {
  test('meal reminder copy is localized', () => {
    expect(mealReminderContent('breakfast', 'en').title).toBe('Breakfast time');
    expect(mealReminderContent('breakfast', 'tr').title).toBe('Kahvaltı vakti');
  });

  test('streak saver mentions the streak length when there is one', () => {
    expect(streakSaverContent(5, 'en').body).toContain('5-day streak');
    expect(streakSaverContent(0, 'en').body).not.toContain('0-day');
  });

  test('weekly report embeds the facts', () => {
    const content = weeklyReportContent({ daysCompleted: 6, currentStreak: 12, avgCalories: 2100 }, 'en');
    expect(content.body).toContain('6/7');
    expect(content.body).toContain('12-day streak');
    expect(content.body).toContain('2100 kcal');
  });
});
