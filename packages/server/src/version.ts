import { execSync } from 'node:child_process';

let cachedVersion: string | null = null;

export function getVersion(): string {
  if (cachedVersion) return cachedVersion;

  try {
    const desc = execSync("git describe --tags --match 'v[0-9]*' --exclude 'packages/*' --dirty --always", {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    cachedVersion = desc;
  } catch {
    // No git or no tags — fall back to package version
    cachedVersion = '0.5.4';
  }

  return cachedVersion;
}
