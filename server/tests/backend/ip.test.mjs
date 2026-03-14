import { describe, it, expect } from 'vitest';
import { getClientIp } from '../../server/utils/ip.mjs';

describe('getClientIp', () => {
  it('returns X-Real-IP when present', () => {
    const req = { headers: { 'x-real-ip': '1.2.3.4' } };
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('returns first IP from comma-separated X-Real-IP', () => {
    const req = { headers: { 'x-real-ip': '10.0.0.1, 10.0.0.2' } };
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('returns X-Forwarded-For when X-Real-IP is absent', () => {
    const req = { headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' } };
    expect(getClientIp(req)).toBe('192.168.1.1');
  });

  it('prefers X-Real-IP over X-Forwarded-For', () => {
    const req = {
      headers: {
        'x-real-ip': '1.1.1.1',
        'x-forwarded-for': '2.2.2.2',
      },
    };
    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('falls back to req.ip', () => {
    const req = { headers: {}, ip: '127.0.0.1' };
    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('falls back to connection.remoteAddress', () => {
    const req = { headers: {}, connection: { remoteAddress: '::1' } };
    expect(getClientIp(req)).toBe('::1');
  });

  it('falls back to socket.remoteAddress', () => {
    const req = { headers: {}, socket: { remoteAddress: '10.10.10.10' } };
    expect(getClientIp(req)).toBe('10.10.10.10');
  });

  it('returns null when no source is available', () => {
    const req = { headers: {} };
    expect(getClientIp(req)).toBeNull();
  });
});
