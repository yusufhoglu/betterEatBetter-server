import type { NextFunction, Request, Response } from 'express';

/** Locales the server can compose user-facing prose in. */
export const SUPPORTED_LOCALES = ['en', 'tr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Used for unknown or unsupported `Accept-Language` tags. */
export const DEFAULT_LOCALE: Locale = 'en';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale?: Locale;
    }
  }
}

function isSupported(tag: string): tag is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(tag);
}

/**
 * Picks the best supported locale from an `Accept-Language` header value.
 * Honours q-values and falls back to {@link DEFAULT_LOCALE} for missing,
 * malformed, or unsupported tags (e.g. `de`, `fr-CA`, `*`).
 */
export function resolveLocale(acceptLanguage: string | undefined | null): Locale {
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag: (tag ?? '').trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.q > 0)
    .sort((left, right) => right.q - left.q);

  for (const { tag } of ranked) {
    const primary = tag.split('-')[0]!;
    if (isSupported(primary)) {
      return primary;
    }
  }

  return DEFAULT_LOCALE;
}

/** Writes the negotiated {@link Locale} onto the request — controllers never parse the header themselves. */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.locale = resolveLocale(req.header('accept-language'));
  next();
}

/**
 * Reads the request locale, resolving straight from the header when the
 * middleware has not run (e.g. slimmed-down test apps). Always returns a
 * supported locale.
 */
export function getLocale(req: Request): Locale {
  return req.locale ?? resolveLocale(req.header('accept-language'));
}
