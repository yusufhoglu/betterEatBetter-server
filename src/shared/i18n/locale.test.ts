import type { NextFunction, Request } from 'express';
import { getLocale, localeMiddleware, resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('defaults to en for a missing header', () => {
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale('')).toBe('en');
  });

  it('matches a simple supported tag', () => {
    expect(resolveLocale('tr')).toBe('tr');
    expect(resolveLocale('en')).toBe('en');
  });

  it('matches on the primary subtag, ignoring region', () => {
    expect(resolveLocale('tr-TR')).toBe('tr');
    expect(resolveLocale('en-US')).toBe('en');
  });

  it('honours q-values when ranking', () => {
    expect(resolveLocale('en;q=0.8,tr;q=0.9')).toBe('tr');
    expect(resolveLocale('tr;q=0.2,en;q=0.7')).toBe('en');
  });

  it('skips unsupported tags and falls back to the next best match', () => {
    expect(resolveLocale('de,fr;q=0.9,tr;q=0.5')).toBe('tr');
  });

  it('defaults to en for unknown or wildcard tags', () => {
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale('*')).toBe('en');
    expect(resolveLocale('fr-CA,fr;q=0.9')).toBe('en');
  });
});

describe('localeMiddleware', () => {
  it('writes the negotiated locale onto the request', () => {
    const req = { header: () => 'tr-TR,tr;q=0.9,en;q=0.8' } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;

    localeMiddleware(req, {} as never, next);

    expect(req.locale).toBe('tr');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('getLocale', () => {
  it('prefers the value the middleware set', () => {
    const req = { locale: 'tr', header: () => 'en' } as unknown as Request;
    expect(getLocale(req)).toBe('tr');
  });

  it('resolves from the header when the middleware has not run', () => {
    const req = { header: () => 'tr' } as unknown as Request;
    expect(getLocale(req)).toBe('tr');
  });
});
