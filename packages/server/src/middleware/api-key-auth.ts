import crypto from 'crypto';
import { hashPassphrase } from '@openleash/core';
import type { ApiKey, ApiKeyScope, DataStore } from '@openleash/core';

export const API_KEY_TOKEN_PREFIX = 'ola_';

/** How stale last_used_at may get before we bother rewriting the file. */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Build an API key bearer token. The api_key_id travels inside the token so
 * the server can look up the stored hash without an extra header.
 */
export function formatApiKeyToken(apiKeyId: string, secret: string): string {
  return `${API_KEY_TOKEN_PREFIX}${apiKeyId}.${secret}`;
}

export function parseApiKeyToken(token: string): { apiKeyId: string; secret: string } | null {
  if (!token.startsWith(API_KEY_TOKEN_PREFIX)) return null;
  const rest = token.slice(API_KEY_TOKEN_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return null;
  return { apiKeyId: rest.slice(0, dot), secret: rest.slice(dot + 1) };
}

export function isApiKeyToken(authorizationHeader: string | undefined): boolean {
  return (authorizationHeader ?? '').startsWith(`Bearer ${API_KEY_TOKEN_PREFIX}`);
}

export type ApiKeyVerification =
  | { ok: true; apiKey: ApiKey }
  | { ok: false; status: 401 | 403; code: string; message: string };

/**
 * Verify `Authorization: Bearer ola_<api_key_id>.<secret>` against the stored
 * scrypt hash and check the key carries `requiredScope`. Refreshes
 * `last_used_at` (throttled) on success.
 */
export function verifyApiKey(
  store: DataStore,
  authorizationHeader: string | undefined,
  requiredScope: ApiKeyScope,
): ApiKeyVerification {
  const header = authorizationHeader ?? '';
  const parsed = header.startsWith('Bearer ') ? parseApiKeyToken(header.slice(7)) : null;
  if (!parsed) {
    return { ok: false, status: 401, code: 'API_KEY_UNAUTHORIZED', message: 'Malformed API key' };
  }

  let apiKey: ApiKey;
  try {
    apiKey = store.apiKeys.read(parsed.apiKeyId);
  } catch {
    return { ok: false, status: 401, code: 'API_KEY_UNAUTHORIZED', message: 'Unknown API key' };
  }

  const { hash } = hashPassphrase(parsed.secret, apiKey.token_salt);
  let matches: boolean;
  try {
    matches = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(apiKey.token_hash));
  } catch {
    matches = false;
  }
  if (!matches) {
    return { ok: false, status: 401, code: 'API_KEY_UNAUTHORIZED', message: 'Invalid API key' };
  }

  if (apiKey.status !== 'ACTIVE') {
    return { ok: false, status: 401, code: 'API_KEY_REVOKED', message: 'API key has been revoked' };
  }

  if (!apiKey.scopes.includes(requiredScope)) {
    return {
      ok: false,
      status: 403,
      code: 'API_KEY_SCOPE_MISSING',
      message: `API key lacks the ${requiredScope} scope`,
    };
  }

  const now = Date.now();
  const lastUsed = apiKey.last_used_at ? Date.parse(apiKey.last_used_at) : 0;
  if (now - lastUsed > LAST_USED_WRITE_INTERVAL_MS) {
    apiKey.last_used_at = new Date(now).toISOString();
    store.apiKeys.write(apiKey);
  }

  return { ok: true, apiKey };
}
