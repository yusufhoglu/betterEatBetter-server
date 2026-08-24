# R2 Photo Flow

This module uses a two-step R2 flow: upload first, process second.

```text
Mobile app
  |
  | 1. Request presigned upload URL
  v
Backend
  |
  | 2. Return presigned PUT URL for:
  |    pending/{mealPhotoId}.jpg
  v
Cloudflare R2 (pending)
  |
  | 3. Mobile uploads the original photo directly
  v
RecognizeFromPhoto
  |
  | 4. Validate the pending object
  |    - exists
  |    - size is allowed
  |    - file signature is valid
  |    - image dimensions are safe
  |
  | 5. Create DB record with status = processing
  |
  | 6. Enqueue two jobs
  |    - recognize-photo
  |    - standardize-and-copy
  v
standardize-and-copy worker
  |
  | 7. Download pending object
  | 8. Resize and re-encode with sharp
  | 9. Upload processed image to:
  |    users/{userId}/meals/{mealPhotoId}.jpg
  v
Cloudflare R2 (final)

Pending files are not deleted by the worker. They are expected to expire through an R2 lifecycle rule.
```

## Summary

- The app uploads the raw image to a temporary `pending/` path.
- The backend validates that file before any recognition work starts.
- A worker writes the normalized image to the final user path.
- The pending object stays in place until the bucket lifecycle removes it.
