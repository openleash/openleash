import * as crypto from 'node:crypto';
import { V4 } from 'paseto';
import type { ServerKeyFile } from './types.js';
import { getPrivateKeyObject, getPublicKeyObject } from './keys.js';

export interface ProofClaims {
  iss: string;
  kid: string;
  iat: string;
  exp: string;
  decision_id: string;
  owner_principal_id: string;
  agent_id: string;
  action_type: string;
  action_hash: string;
  matched_rule_id: string | null;
  trust_profile?: string;
  constraints_snapshot?: Record<string, unknown>;
}

export interface IssueProofParams {
  key: ServerKeyFile;
  decisionId: string;
  ownerPrincipalId: string;
  agentId: string;
  actionType: string;
  actionHash: string;
  matchedRuleId: string | null;
  ttlSeconds: number;
  trustProfile?: string;
  constraintsSnapshot?: Record<string, unknown>;
}

export async function issueProofToken(params: IssueProofParams): Promise<{
  token: string;
  expiresAt: string;
  claims: ProofClaims;
}> {
  const now = new Date();
  const exp = new Date(now.getTime() + params.ttlSeconds * 1000);

  const claims: ProofClaims = {
    iss: 'openleash',
    kid: params.key.kid,
    iat: now.toISOString(),
    exp: exp.toISOString(),
    decision_id: params.decisionId,
    owner_principal_id: params.ownerPrincipalId,
    agent_id: params.agentId,
    action_type: params.actionType,
    action_hash: params.actionHash,
    matched_rule_id: params.matchedRuleId,
  };

  if (params.trustProfile) {
    claims.trust_profile = params.trustProfile;
  }
  if (params.constraintsSnapshot) {
    claims.constraints_snapshot = params.constraintsSnapshot;
  }

  const privateKey = getPrivateKeyObject(params.key);
  const token = await V4.sign({ ...claims } as unknown as Record<string, unknown>, privateKey, {
    expiresIn: `${params.ttlSeconds} seconds`,
  });

  return { token, expiresAt: exp.toISOString(), claims };
}

export async function verifyProofToken(
  token: string,
  keys: ServerKeyFile[]
): Promise<{ valid: boolean; claims?: ProofClaims; reason?: string }> {
  // Try each key
  for (const key of keys) {
    try {
      const publicKey = getPublicKeyObject(key);
      const payload = await V4.verify(token, publicKey) as ProofClaims;

      // Check expiration
      if (payload.exp) {
        const expDate = new Date(payload.exp);
        if (expDate.getTime() < Date.now()) {
          return { valid: false, reason: 'Token expired', claims: payload };
        }
      }

      return { valid: true, claims: payload };
    } catch {
      // Try next key
      continue;
    }
  }

  return { valid: false, reason: 'No matching key found or invalid signature' };
}
