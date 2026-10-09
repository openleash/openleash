import type { AuditEvent } from './types.js';

// ─── Export scoping ───────────────────────────────────────────────────

export interface AuditExportScope {
  ownerType: 'user' | 'org';
  ownerId: string;
}

/**
 * Whether `event` belongs in `scope`'s audit export.
 *
 * Store queries match on principal IDs (the owner plus its current agents),
 * which over-matches after agent transfers. This narrows the candidates using
 * the owner recorded on the event at write time:
 *
 * - events attributed to this owner are in scope;
 * - events directly about the owner principal (actor, user, org, either side
 *   of a transfer) are in scope;
 * - events matched only through one of the owner's agents are in scope unless
 *   they were attributed to a different owner (the agent was transferred).
 *   Legacy events without an owner are kept.
 */
export function auditEventInScope(
  event: AuditEvent,
  scope: AuditExportScope,
  agentIds: Set<string>,
): boolean {
  const meta = (event.metadata_json ?? {}) as Record<string, unknown>;
  const ownerType = typeof meta.owner_type === 'string' ? meta.owner_type : null;
  const ownerId = typeof meta.owner_id === 'string' ? meta.owner_id : null;
  const hasOwner = ownerType !== null && ownerId !== null;

  if (hasOwner && ownerType === scope.ownerType && ownerId === scope.ownerId) return true;

  const pid = scope.ownerId;
  if (
    event.principal_id === pid ||
    meta.user_principal_id === pid ||
    meta.owner_principal_id === pid ||
    meta.org_id === pid ||
    meta.from_owner_id === pid ||
    meta.to_owner_id === pid
  ) {
    return true;
  }

  const agentId =
    typeof meta.agent_principal_id === 'string' ? meta.agent_principal_id : event.principal_id;
  if (agentId && agentIds.has(agentId)) return !hasOwner;

  return false;
}

// ─── OCSF mapping ─────────────────────────────────────────────────────

/** OCSF schema version the mapping targets (https://schema.ocsf.io/1.3.0). */
export const OCSF_SCHEMA_VERSION = '1.3.0';

export type OcsfEvent = Record<string, unknown>;

interface ClassDef {
  uid: number;
  name: string;
  category_uid: number;
  category_name: string;
}

const IAM = { category_uid: 3, category_name: 'Identity & Access Management' };
const APP = { category_uid: 6, category_name: 'Application Activity' };

const CLASS = {
  base: { uid: 0, name: 'Base Event', category_uid: 0, category_name: 'Uncategorized' },
  accountChange: { uid: 3001, name: 'Account Change', ...IAM },
  authentication: { uid: 3002, name: 'Authentication', ...IAM },
  entityManagement: { uid: 3004, name: 'Entity Management', ...IAM },
  groupManagement: { uid: 3006, name: 'Group Management', ...IAM },
  apiActivity: { uid: 6003, name: 'API Activity', ...APP },
} satisfies Record<string, ClassDef>;

interface Mapping {
  cls: ClassDef;
  activity_id: number;
  activity_name: string;
}

const OTHER = 99;

/** Explicit mappings; anything not listed is inferred in `classify()`. */
const EXPLICIT: Record<string, [ClassDef, number, string]> = {
  USER_LOGIN: [CLASS.authentication, 1, 'Logon'],
  USER_LOGOUT: [CLASS.authentication, 2, 'Logoff'],
  USER_TOTP_BACKUP_USED: [CLASS.authentication, OTHER, 'Backup Code Used'],

  USER_CREATED: [CLASS.accountChange, 1, 'Create'],
  INITIAL_SETUP_COMPLETED: [CLASS.accountChange, 1, 'Create'],
  USER_DELETED: [CLASS.accountChange, 6, 'Delete'],
  USER_RECOVERY_REQUESTED: [CLASS.accountChange, 4, 'Password Reset'],
  USER_TOTP_ENABLED: [CLASS.accountChange, 10, 'MFA Factor Enable'],
  USER_TOTP_DISABLED: [CLASS.accountChange, 11, 'MFA Factor Disable'],
  USER_UPDATED: [CLASS.accountChange, OTHER, 'Update'],
  USER_IDENTITY_UPDATED: [CLASS.accountChange, OTHER, 'Identity Update'],
  USER_SETUP_COMPLETED: [CLASS.accountChange, OTHER, 'Setup Completed'],
  USER_SETUP_INVITE_CREATED: [CLASS.accountChange, OTHER, 'Setup Invite Created'],

  ORG_CREATED: [CLASS.groupManagement, 6, 'Create'],
  ORG_DELETED: [CLASS.groupManagement, 5, 'Delete'],
  ORG_MEMBER_ADDED: [CLASS.groupManagement, 3, 'Add User'],
  ORG_INVITE_ACCEPTED: [CLASS.groupManagement, 3, 'Add User'],
  ORG_MEMBER_REMOVED: [CLASS.groupManagement, 4, 'Remove User'],
  ORG_MEMBER_LEFT: [CLASS.groupManagement, 4, 'Remove User'],
  ORG_MEMBER_UPDATED: [CLASS.groupManagement, 1, 'Assign Privileges'],
  ORG_UPDATED: [CLASS.groupManagement, OTHER, 'Update'],
  ORG_INVITE_CREATED: [CLASS.groupManagement, OTHER, 'Invite Created'],
  ORG_INVITE_DECLINED: [CLASS.groupManagement, OTHER, 'Invite Declined'],
  ORG_INVITE_CANCELLED: [CLASS.groupManagement, OTHER, 'Invite Cancelled'],

  AUTHORIZE_CALLED: [CLASS.apiActivity, OTHER, 'Authorize'],
  DECISION_CREATED: [CLASS.apiActivity, OTHER, 'Decision'],
  APPROVAL_TOKEN_USED: [CLASS.apiActivity, OTHER, 'Approval Token Used'],
  PROOF_ISSUED: [CLASS.apiActivity, OTHER, 'Proof Issued'],
  PROOF_VERIFIED: [CLASS.apiActivity, OTHER, 'Proof Verified'],
  AGENT_CHALLENGE_ISSUED: [CLASS.apiActivity, OTHER, 'Challenge Issued'],
  WEBHOOK_DELIVERED: [CLASS.apiActivity, OTHER, 'Webhook Delivered'],
  WEBHOOK_DELIVERY_FAILED: [CLASS.apiActivity, OTHER, 'Webhook Delivery Failed'],
  PLAYGROUND_RUN: [CLASS.apiActivity, OTHER, 'Playground Run'],
};

/** Managed-entity types by event prefix, longest prefix first. */
const ENTITY_PREFIXES: Array<[prefix: string, type: string, uidField: string]> = [
  ['POLICY_GROUP_', 'Policy Group', 'group_id'],
  ['POLICY_DRAFT_', 'Policy Draft', 'policy_draft_id'],
  ['POLICIES_', 'Policy', 'policy_id'],
  ['POLICY_', 'Policy', 'policy_id'],
  ['AGENT_', 'Agent', 'agent_principal_id'],
  ['PROVISIONER_', 'Provisioner', 'provisioner_id'],
  ['TRANSFORMATION_', 'Output Transformation', 'transformation_id'],
  ['API_KEY_', 'API Key', 'api_key_id'],
  ['APPROVAL_REQUEST_', 'Approval Request', 'approval_request_id'],
  ['KEY_', 'Server Key', 'kid'],
];

function entityActivity(eventType: string): [number, string] {
  if (/_(CREATED|REGISTERED|REGISTERED_VIA_INVITE)$/.test(eventType)) return [1, 'Create'];
  if (/_DELETED$/.test(eventType)) return [4, 'Delete'];
  if (/_(UPDATED|UPSERTED|REORDERED|APPROVED|DENIED|REVOKED|BOUND|UNBOUND|ADDED|REMOVED|ROTATED|TRANSFERRED)$/.test(eventType)) {
    return [3, 'Update'];
  }
  return [OTHER, humanize(eventType)];
}

function classify(eventType: string): Mapping {
  const explicit = EXPLICIT[eventType];
  if (explicit) return { cls: explicit[0], activity_id: explicit[1], activity_name: explicit[2] };
  if (ENTITY_PREFIXES.some(([prefix]) => eventType.startsWith(prefix))) {
    const [activity_id, activity_name] = entityActivity(eventType);
    return { cls: CLASS.entityManagement, activity_id, activity_name };
  }
  return { cls: CLASS.base, activity_id: OTHER, activity_name: humanize(eventType) };
}

function humanize(eventType: string): string {
  const words = eventType.toLowerCase().split('_');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/** OCSF decision attributes (Security Control profile) for an authorization result. */
function decisionAttributes(result: string | undefined): Record<string, unknown> {
  switch (result) {
    case 'ALLOW':
      return { action_id: 1, action: 'Allowed', disposition_id: 1, disposition: 'Allowed', status_id: 1, status: 'Success' };
    case 'DENY':
      return { action_id: 2, action: 'Denied', disposition_id: 2, disposition: 'Blocked', status_id: 2, status: 'Failure' };
    case undefined:
      return {};
    default: {
      // REQUIRE_APPROVAL / REQUIRE_STEP_UP / REQUIRE_DEPOSIT — held pending an obligation.
      const label = humanize(result);
      return { action_id: OTHER, action: label, disposition_id: OTHER, disposition: label, status_id: OTHER, status: label };
    }
  }
}

export interface ToOcsfOptions {
  /** OpenLeash version reported in `metadata.product.version`. */
  productVersion: string;
}

/**
 * Map a native audit event to an OCSF 1.3.0 event. The native event is kept
 * whole under `unmapped` so nothing is lost in translation.
 */
export function toOcsfEvent(event: AuditEvent, opts: ToOcsfOptions): OcsfEvent {
  const meta = (event.metadata_json ?? {}) as Record<string, unknown>;
  const { cls, activity_id, activity_name } = classify(event.event_type);

  const agentPrincipalId = str(meta.agent_principal_id);
  const isAgentEvent = cls === CLASS.apiActivity && !!agentPrincipalId;
  const result = event.event_type === 'DECISION_CREATED' ? str(meta.result) : undefined;
  const decision = decisionAttributes(result);
  const severity = result === 'DENY' || event.event_type === 'USER_TOTP_DISABLED'
    ? { severity_id: 2, severity: 'Low' }
    : { severity_id: 1, severity: 'Informational' };

  const actorUid = isAgentEvent
    ? agentPrincipalId
    : event.principal_id ?? str(meta.user_principal_id) ?? str(meta.owner_principal_id);
  const actor = actorUid
    ? {
        user: compact(
          isAgentEvent
            ? { uid: actorUid, name: str(meta.agent_id), type_id: OTHER, type: 'Agent' }
            : { uid: actorUid, type_id: 1, type: 'User' },
        ),
      }
    : undefined;

  const ocsf: OcsfEvent = {
    class_uid: cls.uid,
    class_name: cls.name,
    category_uid: cls.category_uid,
    category_name: cls.category_name,
    activity_id,
    activity_name,
    type_uid: cls.uid * 100 + activity_id,
    type_name: `${cls.name}: ${activity_name}`,
    time: Date.parse(event.timestamp),
    ...severity,
    ...(event.event_type.endsWith('_FAILED')
      ? { status_id: 2, status: 'Failure' }
      : { status_id: 1, status: 'Success' }),
    ...decision,
    message: describe(event, meta, result),
    metadata: compact({
      version: OCSF_SCHEMA_VERSION,
      uid: event.event_id,
      event_code: event.event_type,
      log_name: 'audit',
      original_time: event.timestamp,
      correlation_uid: event.decision_id ?? undefined,
      profiles: result ? ['security_control'] : undefined,
      product: { name: 'OpenLeash', vendor_name: 'OpenLeash', version: opts.productVersion },
    }),
    actor,
  };

  if (cls === CLASS.apiActivity) {
    ocsf.api = { operation: str(meta.action_type) ?? event.event_type };
  }

  if (cls === CLASS.authentication || cls === CLASS.accountChange) {
    const uid = str(meta.user_principal_id) ?? event.principal_id ?? undefined;
    if (uid) ocsf.user = compact({ uid, name: str(meta.display_name) });
  }

  if (cls === CLASS.groupManagement) {
    const orgId = str(meta.org_id) ?? str(meta.owner_id);
    if (orgId) ocsf.group = compact({ uid: orgId, name: str(meta.org_display_name) ?? str(meta.display_name), type: 'Organization' });
    const memberUid = str(meta.user_principal_id);
    if (memberUid) ocsf.user = compact({ uid: memberUid, name: str(meta.user_display_name) });
    if (str(meta.role)) ocsf.privileges = [meta.role];
  }

  if (cls === CLASS.entityManagement) {
    const match = ENTITY_PREFIXES.find(([prefix]) => event.event_type.startsWith(prefix));
    if (match) {
      const [, type, uidField] = match;
      ocsf.entity = compact({ type, uid: str(meta[uidField]), name: str(meta.name) ?? str(meta.agent_id) });
    }
  }

  ocsf.unmapped = {
    event_type: event.event_type,
    principal_id: event.principal_id,
    action_id: event.action_id,
    decision_id: event.decision_id,
    metadata: meta,
  };

  return compact(ocsf);
}

function describe(event: AuditEvent, meta: Record<string, unknown>, result: string | undefined): string {
  const subject = str(meta.agent_id) ? ` by agent ${meta.agent_id}` : '';
  const action = str(meta.action_type) ? ` for action ${meta.action_type}` : '';
  if (result) return `Authorization decision ${result}${subject}${action}`;
  return `${humanize(event.event_type)}${subject}${action}`;
}
