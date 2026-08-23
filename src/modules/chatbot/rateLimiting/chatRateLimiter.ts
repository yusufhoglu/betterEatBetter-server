import type { Request, Response, NextFunction } from 'express';

// TODO: Kullanici bazli mesaj/dakika sinirlamasi (maliyet kontrolu)
export function chatRateLimiter(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
