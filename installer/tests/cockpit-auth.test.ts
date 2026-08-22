/**
 * Contract tests for installer/overlay/usr/lib/nexus/cockpit_auth.py.
 *
 * The cockpit BFF exposes kubectl apply with the node kubeconfig, so these
 * guarantees are security-critical: no hardcoded default password, hashes that
 * are salted and not reversible, constant-time verification, and sessions that
 * cannot be forged.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const AUTH_MODULE = resolve(__dirname, '../overlay/usr/lib/nexus/cockpit_auth.py');
const workdir = mkdtempSync(join(tmpdir(), 'nexus-auth-'));

afterAll(() => rmSync(workdir, { recursive: true, force: true }));

/** Run a Python snippet with cockpit_auth imported as `a`; return parsed JSON. */
function py<T = unknown>(snippet: string, env: Record<string, string> = {}): T {
  const script = [
    'import importlib.util, json, sys',
    `spec = importlib.util.spec_from_file_location("a", ${JSON.stringify(AUTH_MODULE)})`,
    'a = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(a)',
    snippet,
  ].join('\n');
  const out = execFileSync('python3', ['-c', script], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(out) as T;
}

describe('password hashing', { timeout: 30_000 }, () => {
  it('salts hashes so identical passwords differ on disk', { timeout: 30_000 }, () => {
    const result = py<{ same: boolean; algo: string; iterations: number }>(
      [
        'h1 = a.hash_password("correct horse battery staple")',
        'h2 = a.hash_password("correct horse battery staple")',
        'print(json.dumps({"same": h1["hash"] == h2["hash"], "algo": h1["algorithm"], "iterations": h1["iterations"]}))',
      ].join('\n'),
    );
    expect(result.same).toBe(false);
    expect(result.algo).toBe('pbkdf2-sha256');
    expect(result.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it('never stores the plaintext password', () => {
    const result = py<{ leaked: boolean }>(
      [
        'secret = "super-secret-value"',
        'rec = a.hash_password(secret)',
        'print(json.dumps({"leaked": secret in json.dumps(rec)}))',
      ].join('\n'),
    );
    expect(result.leaked).toBe(false);
  });

  it('accepts the right password and rejects near misses', () => {
    const result = py<{ ok: boolean; wrong: boolean; empty: boolean; caseChanged: boolean }>(
      [
        'rec = a.hash_password("Tr0ub4dor&3")',
        'print(json.dumps({',
        '  "ok": a.verify_password("Tr0ub4dor&3", rec),',
        '  "wrong": a.verify_password("Tr0ub4dor&4", rec),',
        '  "empty": a.verify_password("", rec),',
        '  "caseChanged": a.verify_password("tr0ub4dor&3", rec),',
        '}))',
      ].join('\n'),
    );
    expect(result.ok).toBe(true);
    expect(result.wrong).toBe(false);
    expect(result.empty).toBe(false);
    expect(result.caseChanged).toBe(false);
  });

  it('rejects malformed credential records instead of raising', () => {
    const result = py<{ results: boolean[] }>(
      [
        'bad = [{}, {"salt": "!!!", "hash": "!!!"}, {"salt": "AAAA"}, None]',
        'out = []',
        'for rec in bad:',
        '    try:',
        '        out.append(a.verify_password("x", rec or {}))',
        '    except Exception:',
        '        out.append(True)  # raising is a failure for this test',
        'print(json.dumps({"results": out}))',
      ].join('\n'),
    );
    expect(result.results.every((r) => r === false)).toBe(true);
  });
});

describe('credential provisioning', { timeout: 30_000 }, () => {
  it('generates a random password rather than shipping a known default', () => {
    const authFile = join(workdir, 'a1.json');
    const pwFile = join(workdir, 'p1');
    const result = py<{ generated: string; mustChange: boolean; username: string }>(
      [
        'store = a.CredentialStore()',
        'rec, generated = a.ensure_credential_store(store)',
        'print(json.dumps({"generated": generated or "", "mustChange": rec["mustChangePassword"], "username": rec["username"]}))',
      ].join('\n'),
      { NEXUS_COCKPIT_AUTH_FILE: authFile, NEXUS_COCKPIT_PASSWORD_FILE: pwFile },
    );

    expect(result.username).toBe('admin');
    expect(result.mustChange).toBe(true);
    expect(result.generated.length).toBeGreaterThanOrEqual(20);
    // Regression guard: these were the previously shipped defaults.
    expect(['admin', 'demo', 'password', '']).not.toContain(result.generated);
  });

  it('does not regenerate a password once provisioned', () => {
    const authFile = join(workdir, 'a2.json');
    const pwFile = join(workdir, 'p2');
    const env = { NEXUS_COCKPIT_AUTH_FILE: authFile, NEXUS_COCKPIT_PASSWORD_FILE: pwFile };
    const first = py<{ generated: string }>(
      [
        'rec, generated = a.ensure_credential_store(a.CredentialStore())',
        'print(json.dumps({"generated": generated or ""}))',
      ].join('\n'),
      env,
    );
    const second = py<{ generated: string }>(
      [
        'rec, generated = a.ensure_credential_store(a.CredentialStore())',
        'print(json.dumps({"generated": generated or ""}))',
      ].join('\n'),
      env,
    );
    expect(first.generated).not.toBe('');
    expect(second.generated).toBe('');
  });

  it('clears the rotation flag when the password is changed', () => {
    const authFile = join(workdir, 'a3.json');
    const result = py<{ before: boolean; after: boolean; verifies: boolean }>(
      [
        'store = a.CredentialStore()',
        'rec, _ = a.ensure_credential_store(store)',
        'before = rec["mustChangePassword"]',
        'store.set_password("admin", "a-much-longer-password", must_change=False)',
        'rec2 = store.load()',
        'print(json.dumps({',
        '  "before": before,',
        '  "after": rec2["mustChangePassword"],',
        '  "verifies": a.verify_password("a-much-longer-password", rec2["credential"]),',
        '}))',
      ].join('\n'),
      { NEXUS_COCKPIT_AUTH_FILE: authFile, NEXUS_COCKPIT_PASSWORD_FILE: join(workdir, 'p3') },
    );
    expect(result.before).toBe(true);
    expect(result.after).toBe(false);
    expect(result.verifies).toBe(true);
  });
});

describe('sessions', { timeout: 30_000 }, () => {
  it('issues opaque tokens that validate, and rejects forgeries', () => {
    const result = py<{ user: string; bogus: unknown; len: number }>(
      [
        'm = a.SessionManager()',
        's = m.create("admin")',
        'print(json.dumps({',
        '  "user": m.validate(s["token"]),',
        '  "bogus": m.validate("not-a-token"),',
        '  "len": len(s["token"]),',
        '}))',
      ].join('\n'),
    );
    expect(result.user).toBe('admin');
    expect(result.bogus).toBeNull();
    expect(result.len).toBeGreaterThanOrEqual(32);
  });

  it('expires sessions once the TTL elapses', () => {
    const result = py<{ before: string; after: unknown }>(
      [
        'm = a.SessionManager(ttl_seconds=-1)',
        's = m.create("admin")',
        'after = m.validate(s["token"])',
        'm2 = a.SessionManager(ttl_seconds=60)',
        's2 = m2.create("admin")',
        'print(json.dumps({"before": m2.validate(s2["token"]), "after": after}))',
      ].join('\n'),
    );
    expect(result.before).toBe('admin');
    expect(result.after).toBeNull();
  });

  it('revokes a single session and revokes all on demand', () => {
    const result = py<{ revoked: unknown; otherAfterAll: unknown }>(
      [
        'm = a.SessionManager()',
        's1 = m.create("admin")',
        's2 = m.create("admin")',
        'm.revoke(s1["token"])',
        'revoked = m.validate(s1["token"])',
        'm.revoke_all()',
        'print(json.dumps({"revoked": revoked, "otherAfterAll": m.validate(s2["token"])}))',
      ].join('\n'),
    );
    expect(result.revoked).toBeNull();
    expect(result.otherAfterAll).toBeNull();
  });

  it('locks an account out after repeated failures', () => {
    const result = py<{ before: boolean; after: boolean; cleared: boolean }>(
      [
        'm = a.SessionManager()',
        'before = m.locked_out("admin")',
        'for _ in range(a.MAX_FAILED_ATTEMPTS):',
        '    m.record_failure("admin")',
        'after = m.locked_out("admin")',
        'm.clear_failures("admin")',
        'print(json.dumps({"before": before, "after": after, "cleared": m.locked_out("admin")}))',
      ].join('\n'),
    );
    expect(result.before).toBe(false);
    expect(result.after).toBe(true);
    expect(result.cleared).toBe(false);
  });
});

describe('token parsing', () => {
  it('parses only well-formed Bearer headers', () => {
    const result = py<Record<string, unknown>>(
      [
        'print(json.dumps({',
        '  "ok": a.parse_bearer_token("Bearer abc123"),',
        '  "lower": a.parse_bearer_token("bearer abc123"),',
        '  "basic": a.parse_bearer_token("Basic abc123"),',
        '  "empty": a.parse_bearer_token(""),',
        '  "none": a.parse_bearer_token(None),',
        '  "noValue": a.parse_bearer_token("Bearer "),',
        '}))',
      ].join('\n'),
    );
    expect(result.ok).toBe('abc123');
    expect(result.lower).toBe('abc123');
    expect(result.basic).toBeNull();
    expect(result.empty).toBeNull();
    expect(result.none).toBeNull();
    expect(result.noValue).toBeNull();
  });

  it('extracts the session cookie without matching similarly named keys', () => {
    const result = py<Record<string, unknown>>(
      [
        'print(json.dumps({',
        '  "only": a.parse_session_cookie("nexus_session=tok1"),',
        '  "among": a.parse_session_cookie("theme=dark; nexus_session=tok2; other=x"),',
        '  "absent": a.parse_session_cookie("theme=dark"),',
        '  "similar": a.parse_session_cookie("xnexus_session=nope"),',
        '  "none": a.parse_session_cookie(None),',
        '}))',
      ].join('\n'),
    );
    expect(result.only).toBe('tok1');
    expect(result.among).toBe('tok2');
    expect(result.absent).toBeNull();
    expect(result.similar).toBeNull();
    expect(result.none).toBeNull();
  });
});
