import { AggregateMealEntries } from '../domain/AggregateMealEntries';
import { ComputeDayNutrientProgress, type DayNutrientProgress } from '../domain/ComputeDayNutrientProgress';
import type { LoggedMealEntry, MealItem } from '../domain/MealItem';
import type { NutrientTotals } from '../domain/NutrientTotals';
import type { DailyTargetsPort } from '../ports/DailyTargetsPort';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';
import { createFinalDownloadUrl, finalObjectExists } from '../../../shared/storage/presignedUrl';

export interface GetDaySummaryInput {
  userId: string;
  date: Date;
}

export interface DaySummary {
  userId: string;
  date: Date;
  mealItems: DaySummaryMealItem[];
  consumed: NutrientTotals;
  dailyCalorieGoal: number | null;
  dailyProteinGoal: number | null;
  dailyCarbsGoal: number | null;
  dailyFatGoal: number | null;
  remainingCalories: number | null;
  progress: DayNutrientProgress;
}

export type DaySummaryMealEntry = LoggedMealEntry & {
  photoUrl?: string;
};

export interface DaySummaryMealItem extends Omit<MealItem, 'entries'> {
  entries: DaySummaryMealEntry[];
  photoUrl?: string;
  photoUrls: string[];
}

export class GetDaySummary {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly dailyTargetsPort: DailyTargetsPort,
    private readonly photoUrlResolver: (userId: string, mealPhotoId: string) => Promise<string | null> = async (
      userId,
      mealPhotoId,
    ) => {
      if (!(await finalObjectExists(userId, mealPhotoId))) {
        return null;
      }
      return createFinalDownloadUrl(userId, mealPhotoId);
    },
  ) {}

  async execute(input: GetDaySummaryInput): Promise<DaySummary> {
    const mealItems = await this.repository.findByUserIdAndDate(input.userId, input.date);
    const enrichedMealItems = await Promise.all(mealItems.map((mealItem) => this.enrichMealItem(mealItem)));
    const consumed = AggregateMealEntries(mealItems.flatMap((mealItem) => mealItem.entries));
    const dailyTargets = await this.dailyTargetsPort.getDailyTargets(input.userId);
    const progress = ComputeDayNutrientProgress(consumed, dailyTargets);

    return {
      userId: input.userId,
      date: input.date,
      mealItems: enrichedMealItems,
      consumed,
      dailyCalorieGoal: progress.calories.goal,
      dailyProteinGoal: progress.protein.goal,
      dailyCarbsGoal: progress.carbs.goal,
      dailyFatGoal: progress.fat.goal,
      remainingCalories: progress.calories.remaining,
      progress,
    };
  }

  private async enrichMealItem(mealItem: MealItem): Promise<DaySummaryMealItem> {
    const entries = await Promise.all(
      mealItem.entries.map(async (entry): Promise<DaySummaryMealEntry> => {
        if (entry.source !== 'photo') {
          return entry;
        }

        const photoUrl = await this.photoUrlResolver(mealItem.userId, entry.id);
        return {
          ...entry,
          ...(photoUrl ? { photoUrl } : {}),
        };
      }),
    );

    const firstPhotoEntry = entries.find((entry) => typeof entry.photoUrl === 'string');
    const photoUrls = entries
      .map((entry) => entry.photoUrl)
      .filter((photoUrl): photoUrl is string => typeof photoUrl === 'string');

    return {
      ...mealItem,
      entries,
      photoUrl: firstPhotoEntry?.photoUrl,
      photoUrls,
    };
  }
}
