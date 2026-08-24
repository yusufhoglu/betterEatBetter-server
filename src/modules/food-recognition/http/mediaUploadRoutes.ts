import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { CreatePhotoUpload } from '../use-cases/CreatePhotoUpload';
import { MediaUploadController } from './MediaUploadController';

export function mediaUploadRoutes(): Router {
  const router = Router();
  const controller = new MediaUploadController(new CreatePhotoUpload());

  router.post('/upload', authMiddleware, controller.handleCreateUpload);

  return router;
}
