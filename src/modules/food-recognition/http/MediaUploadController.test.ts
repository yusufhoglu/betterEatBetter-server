import type { RequestHandler } from 'express';
import express from 'express';
import request from 'supertest';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import { MediaUploadController } from './MediaUploadController';

const execute = jest.fn();

jest.mock('../use-cases/CreatePhotoUpload', () => ({
  CreatePhotoUpload: jest.fn().mockImplementation(() => ({
    execute,
  })),
}));

describe('MediaUploadController', () => {
  test('201s with a mealPhotoId and presigned upload URL', async () => {
    execute.mockResolvedValue({
      mealPhotoId: 'meal-photo-1',
      uploadUrl: 'https://example.test/presigned',
    });

    const fakeAuthMiddleware: RequestHandler = (req, _res, next) => {
      req.auth = { userId: 'user-1' };
      next();
    };

    const app = express();
    app.post(
      '/upload',
      fakeAuthMiddleware,
      new MediaUploadController({ execute } as never).handleCreateUpload,
    );
    app.use(errorMapperMiddleware);

    const res = await request(app).post('/upload');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      mealPhotoId: 'meal-photo-1',
      uploadUrl: 'https://example.test/presigned',
    });
  });
});
