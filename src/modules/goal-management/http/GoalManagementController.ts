import type { NextFunction, Request, Response } from 'express';
import type { UpdateGoal } from '../use-cases/UpdateGoal';

export class GoalManagementController {
  constructor(private readonly updateGoal: UpdateGoal) {}

  handleUpdateGoal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const plan = await this.updateGoal.execute(req.auth!.userId, req.body);
      res.status(200).json(plan);
    } catch (err) {
      next(err);
    }
  };
}
