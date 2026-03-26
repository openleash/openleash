import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VersionInfo {
  version: string;
  commitHash: string | null;
}

let cached: VersionInfo | null = null;

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return (pkg as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getCommitHash(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

export function getVersionInfo(): VersionInfo {
  if (cached) return cached;
  cached = { version: `v${readPackageVersion()}`, commitHash: getCommitHash() };
  return cached;
}

export function getVersion(): string {
  const { version, commitHash } = getVersionInfo();
  return commitHash ? `${version} (${commitHash})` : version;
}
