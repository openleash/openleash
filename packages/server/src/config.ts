import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { OpenleashConfig } from '@openleash/core';

export const DEFAULT_CONFIG: OpenleashConfig = {
  server: {
    bind_address: '127.0.0.1:8787',
  },
  admin: {
    mode: 'localhost_or_token',
    token: '',
    allow_remote_admin: false,
  },
  security: {
    nonce_ttl_seconds: 600,
    clock_skew_seconds: 120,
  },
  tokens: {
    format: 'paseto_v4_public',
    default_ttl_seconds: 120,
    max_ttl_seconds: 3600,
  },
};

export function loadConfig(rootDir: string): OpenleashConfig {
  const configPath = path.join(rootDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    writeDefaultConfig(rootDir);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(content) as Partial<OpenleashConfig>;

  // Merge with defaults
  return {
    server: { ...DEFAULT_CONFIG.server, ...parsed.server },
    admin: { ...DEFAULT_CONFIG.admin, ...parsed.admin },
    security: { ...DEFAULT_CONFIG.security, ...parsed.security },
    tokens: { ...DEFAULT_CONFIG.tokens, ...parsed.tokens },
  };
}

export function writeDefaultConfig(rootDir: string): void {
  const configPath = path.join(rootDir, 'config.yaml');
  fs.writeFileSync(configPath, stringifyYaml(DEFAULT_CONFIG, { lineWidth: 0 }), 'utf-8');
}

export function updateConfigToken(rootDir: string, token: string): void {
  const configPath = path.join(rootDir, 'config.yaml');
  const config = loadConfig(rootDir);
  config.admin.token = token;
  fs.writeFileSync(configPath, stringifyYaml(config, { lineWidth: 0 }), 'utf-8');
}
