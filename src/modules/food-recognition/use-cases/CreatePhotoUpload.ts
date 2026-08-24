import { randomUUID } from 'node:crypto';
import { createPendingUploadUrl } from '../../../shared/storage/presignedUrl';

export interface PhotoUploadPayload {
  mealPhotoId: string;
  uploadUrl: string;
}

export class CreatePhotoUpload {
  async execute(): Promise<PhotoUploadPayload> {
    const mealPhotoId = randomUUID();
    const uploadUrl = await createPendingUploadUrl(mealPhotoId);

    return {
      mealPhotoId,
      uploadUrl,
    };
  }
}
