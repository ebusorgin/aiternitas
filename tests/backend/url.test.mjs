import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBaseUrl } from '../../server/utils/url.mjs';

describe('getBaseUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.BASE_URL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns FRONTEND_URL when set', () => {
    process.env.FRONTEND_URL = 'https://my-frontend.com/';
    expect(getBaseUrl()).toBe('https://my-frontend.com');
  });

  it('strips trailing slash from FRONTEND_URL', () => {
    process.env.FRONTEND_URL = 'https://example.com/';
    expect(getBaseUrl()).toBe('https://example.com');
  });

  it('returns BASE_URL when FRONTEND_URL is not set', () => {
    process.env.BASE_URL = 'https://base.example.com';
    expect(getBaseUrl()).toBe('https://base.example.com');
  });

  it('prefers FRONTEND_URL over BASE_URL', () => {
    process.env.FRONTEND_URL = 'https://frontend.com';
    process.env.BASE_URL = 'https://base.com';
    expect(getBaseUrl()).toBe('https://frontend.com');
  });

  it('returns production URL when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(getBaseUrl()).toBe('https://aiternitas.ru');
  });

  it('returns localhost default for non-production', () => {
    process.env.NODE_ENV = 'development';
    expect(getBaseUrl()).toBe('http://localhost:3001');
  });
});
