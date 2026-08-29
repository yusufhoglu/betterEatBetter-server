import { ValidationError } from '../../../shared/errors/ValidationError';
import {
  deriveAuthorHue,
  normalizeCaption,
  normalizeCommentText,
  resolveAuthorName,
  resolveFeedLimit,
} from './SocialContent';

describe('SocialContent', () => {
  describe('resolveAuthorName', () => {
    it('prefers name, then username, then the email handle, then a fallback', () => {
      expect(resolveAuthorName({ name: 'Ada', username: 'ada99' })).toBe('Ada');
      expect(resolveAuthorName({ name: '  ', username: 'ada99' })).toBe('ada99');
      expect(
        resolveAuthorName({ name: null, username: null, email: 'ada.lovelace@example.com' }),
      ).toBe('ada.lovelace');
      expect(resolveAuthorName({ name: null, username: null })).toBe('Someone');
    });
  });

  describe('deriveAuthorHue', () => {
    it('is stable and within 0..359', () => {
      const hue = deriveAuthorHue('user-123');
      expect(hue).toBe(deriveAuthorHue('user-123'));
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('differs for different ids', () => {
      expect(deriveAuthorHue('a')).not.toBe(deriveAuthorHue('b'));
    });
  });

  describe('normalizeCaption', () => {
    it('trims trailing whitespace and accepts empty', () => {
      expect(normalizeCaption('hi   ')).toBe('hi');
      expect(normalizeCaption(undefined)).toBe('');
    });

    it('rejects captions over the limit', () => {
      expect(() => normalizeCaption('x'.repeat(281))).toThrow(ValidationError);
    });
  });

  describe('normalizeCommentText', () => {
    it('trims and rejects empty', () => {
      expect(normalizeCommentText('  yum ')).toBe('yum');
      expect(() => normalizeCommentText('   ')).toThrow(ValidationError);
    });

    it('rejects comments over the limit', () => {
      expect(() => normalizeCommentText('x'.repeat(501))).toThrow(ValidationError);
    });
  });

  describe('resolveFeedLimit', () => {
    it('defaults when missing', () => {
      expect(resolveFeedLimit(undefined)).toBe(20);
      expect(resolveFeedLimit('')).toBe(20);
    });

    it('accepts an in-range integer', () => {
      expect(resolveFeedLimit('10')).toBe(10);
      expect(resolveFeedLimit(50)).toBe(50);
    });

    it('rejects out-of-range or non-integer', () => {
      expect(() => resolveFeedLimit('0')).toThrow(ValidationError);
      expect(() => resolveFeedLimit('51')).toThrow(ValidationError);
      expect(() => resolveFeedLimit('2.5')).toThrow(ValidationError);
    });
  });
});
