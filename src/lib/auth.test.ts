import { describe, expect, it } from 'vitest';
import { isDemoLogin } from './auth';

describe('isDemoLogin', () => {
  it('accepts demo-mode admin / admin (browser-only; not the install-node path)', () => {
    expect(isDemoLogin('admin', 'admin')).toBe(true);
  });

  it('also accepts the legacy admin / demo password for backwards compat with walkthroughs', () => {
    expect(isDemoLogin('admin', 'demo')).toBe(true);
  });

  it('rejects any non-default credential combination', () => {
    expect(isDemoLogin('admin', 'wrong')).toBe(false);
    expect(isDemoLogin('user', 'admin')).toBe(false);
    expect(isDemoLogin('user', 'demo')).toBe(false);
    expect(isDemoLogin('', '')).toBe(false);
  });

  it('trims whitespace on the username so paste-then-login works', () => {
    expect(isDemoLogin('  admin  ', 'admin')).toBe(true);
  });
});
