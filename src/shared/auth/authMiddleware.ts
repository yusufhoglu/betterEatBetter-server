import type { Request, Response, NextFunction } from 'express';

// TODO: Request'ten kullaniciyi cozumleyip context'e ekleyen middleware
export function authMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
