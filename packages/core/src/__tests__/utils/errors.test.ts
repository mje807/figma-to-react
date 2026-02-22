import { describe, it, expect, vi } from 'vitest';
import { isF2RError, withRetry, formatF2RError, type F2RError } from '../../utils/errors.js';

describe('isF2RError', () => {
  it('recognizes F2RError', () => {
    const err: F2RError = { code: 'AUTH_FAILED' };
    expect(isF2RError(err)).toBe(true);
  });
  it('rejects plain Error', () => {
    expect(isF2RError(new Error('oops'))).toBe(false);
  });
  it('rejects string', () => {
    expect(isF2RError('error')).toBe(false);
  });
  it('rejects null', () => {
    expect(isF2RError(null)).toBe(false);
  });
});

describe('formatF2RError', () => {
  it('AUTH_FAILED', () => {
    expect(formatF2RError({ code: 'AUTH_FAILED' })).toContain('FIGMA_TOKEN');
  });
  it('RATE_LIMIT', () => {
    expect(formatF2RError({ code: 'RATE_LIMIT', retryAfter: 60 })).toContain('60');
  });
  it('FIGMA_API_ERROR', () => {
    const msg = formatF2RError({ code: 'FIGMA_API_ERROR', status: 404, message: 'Not found' });
    expect(msg).toContain('404');
    expect(msg).toContain('Not found');
  });
});

describe('withRetry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on regular error and eventually succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    // backoff을 0으로 줘서 테스트 빠르게
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxRetries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(fn, 2, 0)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // 초기 1 + retry 2
  });

  it('respects RATE_LIMIT retryAfter', async () => {
    const rateLimitErr: F2RError = { code: 'RATE_LIMIT', retryAfter: 0 };
    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('ok');
  });
});
