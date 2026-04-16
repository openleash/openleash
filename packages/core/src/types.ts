import { z } from 'zod';
import type {
  IdentityAssuranceLevel,
  ContactIdentity,
  GovernmentId,
  CompanyId,
  OrgDomain,
  Signatory,
  SignatoryRule,
} from './identity.js';

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
export const OwnerType = z.enum(['user', 'org']);
export type OwnerType = z.infer<typeof OwnerType>;

export const PrincipalStatus = z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']);
export type PrincipalStatus = z.infer<typeof PrincipalStatus>;

export const AgentStatus = z.enum(['ACTIVE', 'REVOKED']);
export type AgentStatus = z.infer<typeof AgentStatus>;

// ─── Organization roles ─────────────────────────────────────────────
export const OrgRole = z.enum(['org_admin', 'org_member', 'org_viewer']);
export type OrgRole = z.infer<typeof OrgRole>;

export const OrgMembershipStatus = z.enum(['active', 'suspended', 'revoked']);
export type OrgMembershipStatus = z.infer<typeof OrgMembershipStatus>;

// ─── System roles (instance-level RBAC) ─────────────────────────────
export const SystemRole = z.enum(['admin']);
export type SystemRole = z.infer<typeof SystemRole>;

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
  payload: z.record(z.string(), z.unknown()),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

// ─── Obligation ──────────────────────────────────────────────────────
export const ObligationSchema = z.object({
  obligation_id: z.string().uuid(),
  type: ObligationType,
  status: ObligationStatus,
  details_json: z.record(z.string(), z.unknown()).optional(),
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

export interface StateUserEntry {
  user_principal_id: string;
  path: string;
}

export interface StateOrgEntry {
  org_id: string;
  path: string;
}

export interface StateMembershipEntry {
  membership_id: string;
  org_id: string;
  user_principal_id: string;
  role: OrgRole;
  path: string;
}

export interface StateAgentEntry {
  agent_principal_id: string;
  agent_id: string;
  owner_type: OwnerType;
  owner_id: string;
  path: string;
}

export interface StatePolicyEntry {
  policy_id: string;
  owner_type: OwnerType;
  owner_id: string;
  applies_to_agent_principal_id: string | null;
  name: string | null;
  description: string | null;
  path: string;
}

export interface StateBinding {
  owner_type: OwnerType;
  owner_id: string;
  policy_id: string;
  applies_to_agent_principal_id: string | null;
}

export interface StateData {
  version: 2;
  created_at: string;
  server_keys: {
    active_kid: string;
    keys: StateKeyEntry[];
  };
  users: StateUserEntry[];
  organizations: StateOrgEntry[];
  memberships: StateMembershipEntry[];
  agents: StateAgentEntry[];
  policies: StatePolicyEntry[];
  bindings: StateBinding[];
  approval_requests?: StateApprovalRequestEntry[];
  policy_drafts?: StatePolicyDraftEntry[];
}

// ─── Server key file ─────────────────────────────────────────────────
export interface ServerKeyFile {
  kid: string;
  public_key_b64: string;
  private_key_b64: string;
  created_at: string;
  revoked_at: string | null;
}

// ─── System role helpers ─────────────────────────────────────────────

export function resolveSystemRoles(user: UserFrontmatter): SystemRole[] {
  return user.system_roles && user.system_roles.length > 0 ? user.system_roles : [];
}

// ─── User file frontmatter (human who authenticates) ────────────────
export interface UserFrontmatter {
  user_principal_id: string;
  display_name: string;
  status: PrincipalStatus;
  attributes: Record<string, unknown>;
  created_at: string;
  // Identity
  identity_assurance_level?: IdentityAssuranceLevel;
  contact_identities?: ContactIdentity[];
  government_ids?: GovernmentId[];
  // Authentication
  passphrase_hash?: string;
  passphrase_salt?: string;
  passphrase_set_at?: string;
  last_login_at?: string;
  // External auth provider link (e.g., Firebase)
  external_auth_provider?: string;
  external_auth_id?: string;
  // System RBAC (instance-level)
  system_roles?: SystemRole[];
  // Two-factor authentication
  totp_secret_b32?: string;
  totp_enabled?: boolean;
  totp_enabled_at?: string;
  totp_backup_codes_hash?: string[];
}

// ─── Organization file frontmatter (legal entity, never authenticates) ──
export interface OrganizationFrontmatter {
  org_id: string;
  display_name: string;
  status: PrincipalStatus;
  attributes: Record<string, unknown>;
  created_at: string;
  created_by_user_id: string;
  // Identity
  identity_assurance_level?: IdentityAssuranceLevel;
  contact_identities?: ContactIdentity[];
  company_ids?: CompanyId[];
  domains?: OrgDomain[];
  signatories?: Signatory[];
  signatory_rules?: SignatoryRule[];
  // Verification
  verification_status?: 'unverified' | 'pending' | 'verified' | 'failed';
  verification_provider?: string;
  verified_at?: string;
}

// ─── Organization membership ────────────────────────────────────────
export interface OrgMembership {
  membership_id: string;
  org_id: string;
  user_principal_id: string;
  role: OrgRole;
  status: OrgMembershipStatus;
  invited_by_user_id: string | null;
  created_at: string;
}

// ─── Agent file frontmatter ──────────────────────────────────────────
export interface AgentFrontmatter {
  agent_principal_id: string;
  agent_id: string;
  owner_type: OwnerType;
  owner_id: string;
  public_key_b64: string;
  status: AgentStatus;
  attributes: Record<string, unknown>;
  created_at: string;
  revoked_at: string | null;
  webhook_url: string;
  webhook_secret: string;
  webhook_auth_token: string;
}

// ─── Approval request types ─────────────────────────────────────────
export const ApprovalRequestStatus = z.enum([
  'PENDING',
  'APPROVED',
  'DENIED',
  'EXPIRED',
]);
export type ApprovalRequestStatus = z.infer<typeof ApprovalRequestStatus>;

export interface ApprovalRequestFrontmatter {
  approval_request_id: string;
  decision_id: string;
  agent_principal_id: string;
  agent_id: string;
  owner_type: OwnerType;
  owner_id: string;
  action_type: string;
  action_hash: string;
  action: ActionRequest;
  justification: string | null;
  context: Record<string, unknown> | null;
  status: ApprovalRequestStatus;
  approval_token: string | null;
  approval_token_expires_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  denial_reason: string | null;
  consumed_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface StateApprovalRequestEntry {
  approval_request_id: string;
  owner_type: OwnerType;
  owner_id: string;
  agent_principal_id: string;
  status: ApprovalRequestStatus;
  path: string;
}

// ─── Policy draft types ─────────────────────────────────────────────
export const PolicyDraftStatus = z.enum([
  'PENDING',
  'APPROVED',
  'DENIED',
]);
export type PolicyDraftStatus = z.infer<typeof PolicyDraftStatus>;

export interface PolicyDraftFrontmatter {
  policy_draft_id: string;
  agent_principal_id: string;
  agent_id: string;
  owner_type: OwnerType;
  owner_id: string;
  applies_to_agent_principal_id: string | null;
  name: string | null;
  description: string | null;
  policy_yaml: string;
  justification: string | null;
  status: PolicyDraftStatus;
  resulting_policy_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  denial_reason: string | null;
  created_at: string;
}

export interface StatePolicyDraftEntry {
  policy_draft_id: string;
  owner_type: OwnerType;
  owner_id: string;
  agent_principal_id: string;
  status: PolicyDraftStatus;
  path: string;
}

export interface SetupInvite {
  invite_id: string;
  user_principal_id: string;
  token_hash: string;
  token_salt: string;
  expires_at: string;
  used: boolean;
  used_at: string | null;
  created_at: string;
}

export interface AgentInvite {
  invite_id: string;
  owner_type: OwnerType;
  owner_id: string;
  token_hash: string;
  token_salt: string;
  expires_at: string;
  used: boolean;
  used_at: string | null;
  created_at: string;
}

export interface OrgInvite {
  invite_id: string;
  org_id: string;
  user_principal_id: string;
  role: OrgRole;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  invited_by_user_id: string;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
}

export interface OrgMembershipClaim {
  org_id: string;
  role: OrgRole;
}

export interface SessionClaims {
  iss: string;
  kid: string;
  sub: string; // user_principal_id
  iat: string;
  exp: string;
  purpose: 'user_session';
  system_roles?: string[];
  org_memberships?: OrgMembershipClaim[];
}

export interface ApprovalTokenClaims {
  iss: string;
  kid: string;
  iat: string;
  exp: string;
  approval_request_id: string;
  owner_type: OwnerType;
  owner_id: string;
  agent_id: string;
  action_type: string;
  action_hash: string;
  purpose: 'approval';
}

// ─── Audit event ─────────────────────────────────────────────────────
export const AuditEventType = z.enum([
  'USER_CREATED',
  'USER_UPDATED',
  'USER_IDENTITY_UPDATED',
  'USER_SETUP_INVITE_CREATED',
  'USER_SETUP_COMPLETED',
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_TOTP_ENABLED',
  'USER_TOTP_DISABLED',
  'USER_TOTP_BACKUP_USED',
  'ORG_CREATED',
  'ORG_UPDATED',
  'ORG_DELETED',
  'ORG_MEMBER_ADDED',
  'ORG_MEMBER_UPDATED',
  'ORG_MEMBER_REMOVED',
  'ORG_MEMBER_LEFT',
  'ORG_INVITE_CREATED',
  'ORG_INVITE_ACCEPTED',
  'ORG_INVITE_DECLINED',
  'ORG_INVITE_CANCELLED',
  'ORG_VERIFICATION_INITIATED',
  'ORG_VERIFICATION_COMPLETED',
  'ORG_VERIFICATION_FAILED',
  'AGENT_CHALLENGE_ISSUED',
  'AGENT_REGISTERED',
  'AGENT_INVITE_CREATED',
  'AGENT_REGISTERED_VIA_INVITE',
  'POLICY_UPSERTED',
  'POLICY_UPDATED',
  'POLICY_DELETED',
  'POLICY_UNBOUND',
  'POLICY_DRAFT_CREATED',
  'POLICY_DRAFT_APPROVED',
  'POLICY_DRAFT_DENIED',
  'AUTHORIZE_CALLED',
  'DECISION_CREATED',
  'PROOF_ISSUED',
  'PROOF_VERIFIED',
  'APPROVAL_REQUEST_CREATED',
  'APPROVAL_REQUEST_APPROVED',
  'APPROVAL_REQUEST_DENIED',
  'APPROVAL_REQUEST_EXPIRED',
  'APPROVAL_TOKEN_USED',
  'PLAYGROUND_RUN',
  'KEY_ROTATED',
  'SERVER_STARTED',
  'INITIAL_SETUP_COMPLETED',
  'WEBHOOK_DELIVERED',
  'WEBHOOK_DELIVERY_FAILED',
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
    require_totp?: boolean;
  };
  tokens: {
    format: 'paseto_v4_public';
    default_ttl_seconds: number;
    max_ttl_seconds: number;
  };
  gui?: {
    enabled: boolean;
  };
  sessions?: {
    ttl_seconds: number;
  };
  approval?: {
    request_ttl_seconds: number;
    token_ttl_seconds: number;
  };
  store?: {
    type: string;
    options?: Record<string, unknown>;
  };
  instance?: {
    mode: 'self_hosted' | 'hosted';
  };
  plugin?: {
    type: string;
    options?: Record<string, unknown>;
  };
}

// ─── Registration types ──────────────────────────────────────────────
export interface RegistrationChallenge {
  challenge_id: string;
  challenge_b64: string;
  agent_id: string;
  agent_pubkey_b64: string;
  owner_type?: OwnerType;
  owner_id?: string;
  agent_attributes_json?: Record<string, unknown>;
  expires_at: string;
}

// ─── Verification types (for org verification plugins) ──────────────

export interface VerificationEvidence {
  evidence_type: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  details: Record<string, unknown>;
}

export interface RegistryCompanyInfo {
  company_name: string;
  registration_number?: string;
  country: string;
  status?: string;
  address?: string;
  authorized_persons?: Array<{
    name: string;
    role?: string;
    identifiers?: Record<string, string>;
  }>;
  raw_data?: Record<string, unknown>;
}

export interface OrgVerificationRecord {
  verification_id: string;
  provider_id: string;
  country: string;
  initiated_by_user_id: string;
  initiated_at: string;
  status: 'pending' | 'verified' | 'failed' | 'expired';
  company_info?: RegistryCompanyInfo;
  evidence: VerificationEvidence[];
  verified_at?: string;
  expires_at?: string;
}
