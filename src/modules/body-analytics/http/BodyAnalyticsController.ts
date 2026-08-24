import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { AddBodyMeasurement } from '../use-cases/AddBodyMeasurement';
import type { DeleteBodyMeasurement } from '../use-cases/DeleteBodyMeasurement';
import type { GetBodySilhouetteProfile } from '../use-cases/GetBodySilhouetteProfile';
import type { GetBodyStats } from '../use-cases/GetBodyStats';
import type { GetGoalProgress } from '../use-cases/GetGoalProgress';
import type { GetMealAverages } from '../use-cases/GetMealAverages';
import type { GetMealBreakdown } from '../use-cases/GetMealBreakdown';
import type { GetMealCorrelation } from '../use-cases/GetMealCorrelation';
import type { GetMealInsights } from '../use-cases/GetMealInsights';
import type { GetMeasurementTrend } from '../use-cases/GetMeasurementTrend';
import type { GetTopFoods } from '../use-cases/GetTopFoods';
import type { GetWaistHeightRatio } from '../use-cases/GetWaistHeightRatio';
import type { GetWeeklyMealTrend } from '../use-cases/GetWeeklyMealTrend';
import type { ListBodyMeasurements } from '../use-cases/ListBodyMeasurements';
import type { UpdateBodyMeasurement } from '../use-cases/UpdateBodyMeasurement';
import type { UpdateBodySilhouetteProfile } from '../use-cases/UpdateBodySilhouetteProfile';
import { assertBodyMeasurementMetric, assertMealMetric } from '../use-cases/bodyAnalyticsShared';

const measurementSchema = z.object({
  metric: z.enum(['weight', 'bodyFat', 'waist', 'neck', 'hip', 'muscleMass']),
  value: z.number().positive(),
  unit: z.string().min(1),
  date: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
});

const updateMeasurementSchema = z.object({
  value: z.number().positive().optional(),
  unit: z.string().min(1).optional(),
  date: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
});

const silhouetteSchema = z.object({
  heightCm: z.number().positive().optional(),
  neckCm: z.number().positive().nullable().optional(),
  shoulderCm: z.number().positive().nullable().optional(),
  waistCm: z.number().positive().nullable().optional(),
  hipCm: z.number().positive().nullable().optional(),
  sex: z.enum(['male', 'female']).optional(),
});

export class BodyAnalyticsController {
  constructor(
    private readonly getBodyStats: GetBodyStats,
    private readonly listBodyMeasurements: ListBodyMeasurements,
    private readonly addBodyMeasurement: AddBodyMeasurement,
    private readonly updateBodyMeasurement: UpdateBodyMeasurement,
    private readonly deleteBodyMeasurement: DeleteBodyMeasurement,
    private readonly getMeasurementTrend: GetMeasurementTrend,
    private readonly getBodySilhouetteProfile: GetBodySilhouetteProfile,
    private readonly updateBodySilhouetteProfile: UpdateBodySilhouetteProfile,
    private readonly getWaistHeightRatio: GetWaistHeightRatio,
    private readonly getGoalProgress: GetGoalProgress,
    private readonly getMealAverages: GetMealAverages,
    private readonly getWeeklyMealTrend: GetWeeklyMealTrend,
    private readonly getMealBreakdown: GetMealBreakdown,
    private readonly getTopFoods: GetTopFoods,
    private readonly getMealInsights: GetMealInsights,
    private readonly getMealCorrelation: GetMealCorrelation,
  ) {}

  private normalizeMealMetric(metric: string): 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' {
    if (metric === 'protein') {
      return 'proteinG';
    }
    if (metric === 'carbs') {
      return 'carbsG';
    }
    if (metric === 'fat') {
      return 'fatG';
    }
    if (metric === 'fiber') {
      return 'fiberG';
    }
    assertMealMetric(metric);
    return metric;
  }

  handleGetBodyStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getBodyStats.execute(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handleListBodyMeasurements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(
        await this.listBodyMeasurements.execute(req.auth!.userId, {
          metric: req.query.metric as string | undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          cursor: req.query.cursor as string | undefined,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  handleAddBodyMeasurement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = measurementSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
      }

      const created = await this.addBodyMeasurement.execute(req.auth!.userId, {
        ...parsed.data,
        date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  };

  handleUpdateBodyMeasurement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.params.id) {
        throw new ValidationError('INVALID_PARAMS', 'id is required');
      }
      const parsed = updateMeasurementSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
      }

      const updated = await this.updateBodyMeasurement.execute(req.auth!.userId, req.params.id, {
        value: parsed.data.value,
        unit: parsed.data.unit,
        date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      });
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };

  handleDeleteBodyMeasurement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.params.id) {
        throw new ValidationError('INVALID_PARAMS', 'id is required');
      }
      await this.deleteBodyMeasurement.execute(req.auth!.userId, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  handleGetMeasurementTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metric = req.query.metric as string;
      const range = req.query.range as '1W' | '1M' | '3M' | '6M' | '1Y' | 'All';
      assertBodyMeasurementMetric(metric);
      if (!['weight', 'bodyFat', 'waist', 'muscleMass'].includes(metric)) {
        throw new ValidationError('INVALID_METRIC', 'Unsupported trend metric');
      }
      res.status(200).json(await this.getMeasurementTrend.execute(req.auth!.userId, metric as never, range));
    } catch (error) {
      next(error);
    }
  };

  handleGetBodyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getBodySilhouetteProfile.execute(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePatchBodyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = silhouetteSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
      }

      res.status(200).json(await this.updateBodySilhouetteProfile.execute(req.auth!.userId, parsed.data));
    } catch (error) {
      next(error);
    }
  };

  handleGetWaistHeightRatio = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getWaistHeightRatio.execute(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handleGetGoalProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getGoalProgress.execute(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handleGetMealAverages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getMealAverages.execute(req.auth!.userId, req.query.range as never));
    } catch (error) {
      next(error);
    }
  };

  handleGetWeeklyMealTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metric = this.normalizeMealMetric(req.query.metric as string);
      res.status(200).json(
        await this.getWeeklyMealTrend.execute(req.auth!.userId, metric as never, req.query.range as never),
      );
    } catch (error) {
      next(error);
    }
  };

  handleGetMealBreakdown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getMealBreakdown.execute(req.auth!.userId, req.query.range as never));
    } catch (error) {
      next(error);
    }
  };

  handleGetTopFoods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getTopFoods.execute(req.auth!.userId, req.query.range as never));
    } catch (error) {
      next(error);
    }
  };

  handleGetMealInsights = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.getMealInsights.execute(req.auth!.userId, req.query.range as never));
    } catch (error) {
      next(error);
    }
  };

  handleGetMealCorrelation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const x = this.normalizeMealMetric(req.query.x as string);
      const y = req.query.y as string;
      assertBodyMeasurementMetric(y);
      res.status(200).json(
        await this.getMealCorrelation.execute(
          req.auth!.userId,
          x as never,
          y,
          req.query.range as never,
        ),
      );
    } catch (error) {
      next(error);
    }
  };
}
