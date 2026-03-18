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
    require_totp: false,
  },
  tokens: {
    format: 'paseto_v4_public',
    default_ttl_seconds: 120,
    max_ttl_seconds: 3600,
  },
  gui: {
    enabled: true,
  },
  sessions: {
    ttl_seconds: 28800,
  },
  approval: {
    request_ttl_seconds: 86400,
    token_ttl_seconds: 3600,
  },
  store: {
    type: 'file',
  },
  instance: {
    mode: 'self_hosted' as const,
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
    gui: { enabled: true, ...DEFAULT_CONFIG.gui, ...(parsed.gui ?? {}) },
    sessions: { ...DEFAULT_CONFIG.sessions!, ...parsed.sessions },
    approval: { ...DEFAULT_CONFIG.approval!, ...parsed.approval },
    store: { ...DEFAULT_CONFIG.store!, ...parsed.store },
    instance: { ...DEFAULT_CONFIG.instance!, ...parsed.instance },
    plugin: parsed.plugin,
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
