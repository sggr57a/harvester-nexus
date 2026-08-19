/**
 * Built-in cockpit credentials.
 *
 * The Harvester-Nexus installer seeds the cluster with `admin` / `admin`
 * by default and flags the account for password rotation on first login
 * (see `installer/manifests/10-default-admin.yaml`). This module mirrors
 * that contract so the cockpit's standalone demo + the installed
 * cockpit both accept the same canonical credentials.
 *
 * Historical note: the dev demo previously accepted `admin` / `demo`
 * too — we keep that alias so existing test scripts + walkthrough
 * artifacts don't break, but the documented default is now
 * `admin` / `admin`.
 */
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORDS = ['admin', 'demo'] as const;

export function isDemoLogin(username: string, password: string): boolean {
  return username.trim() === DEFAULT_USERNAME && (DEFAULT_PASSWORDS as readonly string[]).includes(password);
}
