import { canonicalize } from 'json-canonicalize';
import * as crypto from 'node:crypto';
import type { ActionRequest } from './types.js';

export function canonicalJson(obj: unknown): string {
  return canonicalize(obj);
}

export function computeActionHash(action: ActionRequest): string {
  const canonical = canonicalJson(action);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
