import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

describe('installer · ci-version.sh', () => {
  it('emits base version with local suffix when GITHUB_RUN_NUMBER is unset', () => {
    const script = join(process.cwd(), 'installer', 'ci-version.sh');
    const version = execSync(`bash "${script}"`, {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_RUN_NUMBER: '', GITHUB_SHA: '' },
    }).trim();
    expect(version).toMatch(/^1\.0\.0\+nexus\.1\.local\.[0-9a-f]{7}$/);
  });

  it('includes run number and sha when CI env vars are set', () => {
    const script = join(process.cwd(), 'installer', 'ci-version.sh');
    const version = execSync(`bash "${script}"`, {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_RUN_NUMBER: '42',
        GITHUB_SHA: 'abcdef1234567890',
      },
    }).trim();
    expect(version).toBe('1.0.0+nexus.1.main.42.abcdef1');
  });
});
