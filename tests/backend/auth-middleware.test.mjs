import { describe, it, expect, vi } from 'vitest';
import { requireAuth, optionalAuth } from '../../server/middleware/auth.mjs';

describe('requireAuth middleware', () => {
  it('calls next() when session has userId', () => {
    const req = { session: { userId: 1 } };
    const res = {};
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 401 when session has no userId', () => {
    const req = { session: {} };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Требуется авторизация' });
  });

  it('returns 401 when session is undefined', () => {
    const req = {};
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});

describe('optionalAuth middleware', () => {
  it('always calls next()', () => {
    const req = {};
    const res = {};
    const next = vi.fn();

    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
