import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

function runCiVersion(env: Record<string, string>): string {
  const script = join(process.cwd(), 'installer', 'ci-version.sh');
  return execSync(`bash "${script}"`, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim();
}

describe('installer · ci-version.sh', () => {
  it('emits base version with local suffix on main when GITHUB_RUN_NUMBER is unset', () => {
    const version = runCiVersion({
      GITHUB_RUN_NUMBER: '',
      GITHUB_SHA: '',
      GITHUB_REF_NAME: 'main',
    });
    expect(version).toMatch(/^2\.1\.0\+nexus\.unified\.1\.local\.[0-9a-f]{7}$/);
  });

  it('includes branch slug for local feature-branch builds', () => {
    const version = runCiVersion({
      GITHUB_RUN_NUMBER: '',
      GITHUB_SHA: 'cadca0b1234567890',
      GITHUB_REF_NAME: 'cursor/harvester-nexus-unified-5878',
    });
    expect(version).toBe('2.1.0+nexus.unified.1.cursor-harvester-nexus-unified-5878.local.cadca0b');
  });

  it('includes run number and sha for main CI builds', () => {
    const version = runCiVersion({
      GITHUB_RUN_NUMBER: '42',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_REF_NAME: 'main',
    });
    expect(version).toBe('2.1.0+nexus.unified.1.main.42.abcdef1');
  });

  it('includes branch slug for feature-branch CI builds', () => {
    const version = runCiVersion({
      GITHUB_RUN_NUMBER: '7',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_REF_NAME: 'cursor/harvester-nexus-unified-5878',
    });
    expect(version).toBe('2.1.0+nexus.unified.1.cursor-harvester-nexus-unified-5878.7.abcdef1');
  });
});
