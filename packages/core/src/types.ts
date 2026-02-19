import { z } from 'zod';

// ─── Decision results ────────────────────────────────────────────────
export const DecisionResult = z.enum([
  'ALLOW',
  'DENY',
  'REQUIRE_APPROVAL',
  'REQUIRE_STEP_UP',
  'REQUIRE_DEPOSIT',
]);
export type DecisionResult = z.infer<typeof DecisionResult>;

// ─── Obligation types ────────────────────────────────────────────────
export const ObligationType = z.enum([
  'HUMAN_APPROVAL',
  'STEP_UP_AUTH',
  'DEPOSIT',
  'COUNTERPARTY_ATTESTATION',
]);
export type ObligationType = z.infer<typeof ObligationType>;

export const ObligationStatus = z.enum(['PENDING', 'FULFILLED', 'WAIVED']);
export type ObligationStatus = z.infer<typeof ObligationStatus>;

// ─── Principal types ─────────────────────────────────────────────────
export const PrincipalType = z.enum(['HUMAN', 'ORG']);
export type PrincipalType = z.infer<typeof PrincipalType>;

export const PrincipalStatus = z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']);
export type PrincipalStatus = z.infer<typeof PrincipalStatus>;

export const AgentStatus = z.enum(['ACTIVE', 'REVOKED']);
export type AgentStatus = z.infer<typeof AgentStatus>;

// ─── Trust profiles ──────────────────────────────────────────────────
export const TrustProfile = z.enum(['LOW', 'MEDIUM', 'HIGH', 'REGULATED']);
export type TrustProfile = z.infer<typeof TrustProfile>;

export const AssuranceLevel = z.enum(['LOW', 'SUBSTANTIAL', 'HIGH']);
export type AssuranceLevel = z.infer<typeof AssuranceLevel>;

// ─── ActionRequest ───────────────────────────────────────────────────
export const ActionRequestSchema = z.object({
  action_id: z.string().uuid(),
  action_type: z.string().min(1),
  requested_at: z.string(), // RFC3339
  principal: z.object({
    agent_id: z.string().min(1),
  }),
  subject: z.object({
    principal_id: z.string().uuid(),
  }),
  relying_party: z.object({
    rp_id: z.string().uuid().optional(),
    domain: z.string().optional(),
    trust_profile: TrustProfile.optional(),
  }).optional(),
  payload: z.record(z.unknown()),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

// ─── Obligation ──────────────────────────────────────────────────────
export const ObligationSchema = z.object({
  obligation_id: z.string().uuid(),
  type: ObligationType,
  status: ObligationStatus,
  details_json: z.record(z.unknown()).optional(),
});
export type Obligation = z.infer<typeof ObligationSchema>;

// ─── AuthorizeResponse ───────────────────────────────────────────────
export interface AuthorizeResponse {
  decision_id: string;
  action_id: string;
  action_hash: string;
  result: DecisionResult;
  matched_rule_id: string | null;
  reason: string;
  proof_token: string | null;
  proof_expires_at: string | null;
  obligations: Obligation[];
}

// ─── Policy types ────────────────────────────────────────────────────
export interface PolicyExprMatch {
  path: string;
  op: 'eq' | 'neq' | 'in' | 'nin' | 'lt' | 'lte' | 'gt' | 'gte' | 'regex' | 'exists';
  value?: unknown;
}

export type PolicyExpr =
  | { all: PolicyExpr[] }
  | { any: PolicyExpr[] }
  | { not: PolicyExpr }
  | { match: PolicyExprMatch };

export interface PolicyConstraints {
  amount_max?: number;
  amount_min?: number;
  currency?: string[];
  merchant_domain?: string[];
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface PolicyRequirements {
  min_assurance_level?: 'LOW' | 'SUBSTANTIAL' | 'HIGH';
  credential_scheme?: string;
}

export interface PolicyObligation {
  type: string; // maps to ObligationType
  params?: Record<string, unknown>;
}

export interface PolicyProof {
  required?: boolean;
  ttl_seconds?: number;
}

export interface PolicyRule {
  id: string;
  effect: 'allow' | 'deny';
  action: string;
  description?: string;
  when?: PolicyExpr;
  constraints?: PolicyConstraints;
  requirements?: PolicyRequirements;
  obligations?: PolicyObligation[];
  proof?: PolicyProof;
}

export interface Policy {
  version: 1;
  default: 'allow' | 'deny';
  rules: PolicyRule[];
}

// ─── Evaluation trace ────────────────────────────────────────────────
export interface RuleTrace {
  rule_id: string;
  pattern_match: boolean;
  when_match: boolean | null;
  constraints_match: boolean | null;
  final_match: boolean;
}

export interface EvaluationTrace {
  rules: RuleTrace[];
}

// ─── State types ─────────────────────────────────────────────────────
export interface StateKeyEntry {
  kid: string;
  path: string;
}

export interface StateOwnerEntry {
  owner_principal_id: string;
  path: string;
}

export interface StateAgentEntry {
  agent_principal_id: string;
  agent_id: string;
  owner_principal_id: string;
  path: string;
}

export interface StatePolicyEntry {
  policy_id: string;
  owner_principal_id: string;
  applies_to_agent_principal_id: string | null;
  path: string;
}

export interface StateBinding {
  owner_principal_id: string;
  policy_id: string;
  applies_to_agent_principal_id: string | null;
}

export interface StateData {
  version: 1;
  created_at: string;
  server_keys: {
    active_kid: string;
    keys: StateKeyEntry[];
  };
  owners: StateOwnerEntry[];
  agents: StateAgentEntry[];
  policies: StatePolicyEntry[];
  bindings: StateBinding[];
}

// ─── Server key file ─────────────────────────────────────────────────
export interface ServerKeyFile {
  kid: string;
  public_key_b64: string;
  private_key_b64: string;
  created_at: string;
  revoked_at: string | null;
}

// ─── Owner file frontmatter ──────────────────────────────────────────
export interface OwnerFrontmatter {
  owner_principal_id: string;
  principal_type: PrincipalType;
  display_name: string;
  status: PrincipalStatus;
  attributes: Record<string, unknown>;
  created_at: string;
}

// ─── Agent file frontmatter ──────────────────────────────────────────
export interface AgentFrontmatter {
  agent_principal_id: string;
  agent_id: string;
  owner_principal_id: string;
  public_key_b64: string;
  status: AgentStatus;
  attributes: Record<string, unknown>;
  created_at: string;
  revoked_at: string | null;
}

// ─── Audit event ─────────────────────────────────────────────────────
export const AuditEventType = z.enum([
  'OWNER_CREATED',
  'AGENT_CHALLENGE_ISSUED',
  'AGENT_REGISTERED',
  'POLICY_UPSERTED',
  'AUTHORIZE_CALLED',
  'DECISION_CREATED',
  'PROOF_ISSUED',
  'PROOF_VERIFIED',
  'PLAYGROUND_RUN',
  'KEY_ROTATED',
  'SERVER_STARTED',
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  principal_id: string | null;
  action_id: string | null;
  decision_id: string | null;
  metadata_json: Record<string, unknown>;
}

// ─── Config ──────────────────────────────────────────────────────────
export interface OpenleashConfig {
  server: {
    bind_address: string;
  };
  admin: {
    mode: 'localhost' | 'token' | 'localhost_or_token';
    token: string;
    allow_remote_admin: boolean;
  };
  security: {
    nonce_ttl_seconds: number;
    clock_skew_seconds: number;
  };
  tokens: {
    format: 'paseto_v4_public';
    default_ttl_seconds: number;
    max_ttl_seconds: number;
  };
  gui?: {
    enabled: boolean;
  };
}

// ─── Registration types ──────────────────────────────────────────────
export interface RegistrationChallenge {
  challenge_id: string;
  challenge_b64: string;
  agent_id: string;
  agent_pubkey_b64: string;
  owner_principal_id?: string;
  agent_attributes_json?: Record<string, unknown>;
  expires_at: string;
}
