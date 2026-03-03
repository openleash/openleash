import * as crypto from 'node:crypto';
import { V4 } from 'paseto';
import { canonicalize } from 'json-canonicalize';

// ─── Key generation ──────────────────────────────────────────────────
export function generateEd25519Keypair(): {
  publicKeyB64: string;
  privateKeyB64: string;
} {
  const keypair = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = keypair.publicKey.export({ type: 'spki', format: 'der' });
  const privateKeyDer = keypair.privateKey.export({ type: 'pkcs8', format: 'der' });
  return {
    publicKeyB64: publicKeyDer.toString('base64'),
    privateKeyB64: privateKeyDer.toString('base64'),
  };
}

// ─── Request signing ─────────────────────────────────────────────────
export function signRequest(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyBytes: Buffer;
  privateKeyB64: string;
}): {
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Body-Sha256': string;
  'X-Signature': string;
} {
  const bodySha256 = crypto.createHash('sha256').update(params.bodyBytes).digest('hex');
  const signingInput = [
    params.method,
    params.path,
    params.timestamp,
    params.nonce,
    bodySha256,
  ].join('\n');

  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(params.privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);

  return {
    'X-Timestamp': params.timestamp,
    'X-Nonce': params.nonce,
    'X-Body-Sha256': bodySha256,
    'X-Signature': signature.toString('base64'),
  };
}

// ─── Registration challenge ──────────────────────────────────────────
export async function registrationChallenge(params: {
  openleashUrl: string;
  agentId: string;
  agentPubKeyB64: string;
  ownerPrincipalId?: string;
}): Promise<{
  challenge_id: string;
  challenge_b64: string;
  expires_at: string;
}> {
  const res = await fetch(`${params.openleashUrl}/v1/agents/registration-challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: params.agentId,
      agent_pubkey_b64: params.agentPubKeyB64,
      owner_principal_id: params.ownerPrincipalId,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Registration challenge failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<{ challenge_id: string; challenge_b64: string; expires_at: string }>;
}

// ─── Register agent ──────────────────────────────────────────────────
export async function registerAgent(params: {
  openleashUrl: string;
  challengeId: string;
  agentId: string;
  agentPubKeyB64: string;
  signatureB64: string;
  ownerPrincipalId: string;
}): Promise<{
  agent_principal_id: string;
  agent_id: string;
  owner_principal_id: string;
  status: string;
  created_at: string;
}> {
  const res = await fetch(`${params.openleashUrl}/v1/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: params.challengeId,
      agent_id: params.agentId,
      agent_pubkey_b64: params.agentPubKeyB64,
      signature_b64: params.signatureB64,
      owner_principal_id: params.ownerPrincipalId,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Agent registration failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<{
    agent_principal_id: string;
    agent_id: string;
    owner_principal_id: string;
    status: string;
    created_at: string;
  }>;
}

// ─── Authorize ───────────────────────────────────────────────────────
export async function authorize(params: {
  openleashUrl: string;
  agentId: string;
  privateKeyB64: string;
  action: Record<string, unknown>;
  approvalToken?: string;
}): Promise<Record<string, unknown>> {
  const body = params.approvalToken
    ? { ...params.action, approval_token: params.approvalToken }
    : params.action;
  const bodyBytes = Buffer.from(JSON.stringify(body));
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();

  const headers = signRequest({
    method: 'POST',
    path: '/v1/authorize',
    timestamp,
    nonce,
    bodyBytes,
    privateKeyB64: params.privateKeyB64,
  });

  const res = await fetch(`${params.openleashUrl}/v1/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': params.agentId,
      ...headers,
    },
    body: bodyBytes.toString(),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Authorize failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Verify proof online ─────────────────────────────────────────────
export async function verifyProofOnline(params: {
  openleashUrl: string;
  token: string;
  expectedActionHash?: string;
  expectedAgentId?: string;
}): Promise<{ valid: boolean; reason?: string; claims?: Record<string, unknown> }> {
  const res = await fetch(`${params.openleashUrl}/v1/verify-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: params.token,
      expected_action_hash: params.expectedActionHash,
      expected_agent_id: params.expectedAgentId,
    }),
  });

  return res.json() as Promise<{ valid: boolean; reason?: string; claims?: Record<string, unknown> }>;
}

// ─── Verify proof offline ────────────────────────────────────────────
export async function verifyProofOffline(params: {
  token: string;
  publicKeys: Array<{ kid: string; public_key_b64: string }>;
}): Promise<{ valid: boolean; claims?: Record<string, unknown>; reason?: string }> {
  for (const key of params.publicKeys) {
    try {
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(key.public_key_b64, 'base64'),
        format: 'der',
        type: 'spki',
      });

      const payload = await V4.verify(params.token, publicKey) as Record<string, unknown>;

      // Check expiration
      if (payload.exp) {
        const expDate = new Date(payload.exp as string);
        if (expDate.getTime() < Date.now()) {
          return { valid: false, reason: 'Token expired', claims: payload };
        }
      }

      return { valid: true, claims: payload };
    } catch {
      continue;
    }
  }

  return { valid: false, reason: 'No matching key found or invalid signature' };
}

// ─── Approval requests ──────────────────────────────────────────────

export async function createApprovalRequest(params: {
  openleashUrl: string;
  agentId: string;
  privateKeyB64: string;
  decisionId: string;
  action: Record<string, unknown>;
  justification?: string;
  context?: Record<string, unknown>;
}): Promise<{
  approval_request_id: string;
  status: string;
  expires_at: string;
}> {
  const body = {
    decision_id: params.decisionId,
    action: params.action,
    ...(params.justification && { justification: params.justification }),
    ...(params.context && { context: params.context }),
  };
  const bodyBytes = Buffer.from(JSON.stringify(body));
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();

  const headers = signRequest({
    method: 'POST',
    path: '/v1/agent/approval-requests',
    timestamp,
    nonce,
    bodyBytes,
    privateKeyB64: params.privateKeyB64,
  });

  const res = await fetch(`${params.openleashUrl}/v1/agent/approval-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': params.agentId,
      ...headers,
    },
    body: bodyBytes.toString(),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Create approval request failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<{ approval_request_id: string; status: string; expires_at: string }>;
}

export async function getApprovalRequest(params: {
  openleashUrl: string;
  agentId: string;
  privateKeyB64: string;
  approvalRequestId: string;
}): Promise<{
  approval_request_id: string;
  status: string;
  approval_token?: string;
  approval_token_expires_at?: string;
}> {
  const bodyBytes = Buffer.from('{}');
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const urlPath = `/v1/agent/approval-requests/${params.approvalRequestId}`;

  const headers = signRequest({
    method: 'GET',
    path: urlPath,
    timestamp,
    nonce,
    bodyBytes,
    privateKeyB64: params.privateKeyB64,
  });

  const res = await fetch(`${params.openleashUrl}${urlPath}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': params.agentId,
      ...headers,
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Get approval request failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<{
    approval_request_id: string;
    status: string;
    approval_token?: string;
    approval_token_expires_at?: string;
  }>;
}

export async function pollApprovalRequest(params: {
  openleashUrl: string;
  agentId: string;
  privateKeyB64: string;
  approvalRequestId: string;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<{
  approval_request_id: string;
  status: string;
  approval_token?: string;
  approval_token_expires_at?: string;
}> {
  const interval = params.intervalMs ?? 5000;
  const timeout = params.timeoutMs ?? 300000; // 5 minutes default
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = await getApprovalRequest({
      openleashUrl: params.openleashUrl,
      agentId: params.agentId,
      privateKeyB64: params.privateKeyB64,
      approvalRequestId: params.approvalRequestId,
    });

    if (result.status !== 'PENDING') {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Approval request polling timed out after ${timeout}ms`);
}
