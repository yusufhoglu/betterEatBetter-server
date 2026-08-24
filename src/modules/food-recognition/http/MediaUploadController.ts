import type { NextFunction, Request, Response } from 'express';
import type { CreatePhotoUpload } from '../use-cases/CreatePhotoUpload';

export class MediaUploadController {
  constructor(private readonly createPhotoUpload: CreatePhotoUpload) {}

  handleCreateUpload = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = await this.createPhotoUpload.execute();
      res.status(201).json(payload);
    } catch (err) {
      next(err);
    }
  };
}
