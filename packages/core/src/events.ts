import { EventEmitter } from 'node:events';

// ─── Event payload types ────────────────────────────────────────────

export interface ApprovalRequestCreatedEvent {
  approval_request_id: string;
  decision_id: string;
  agent_id: string;
  agent_principal_id: string;
  owner_type: 'user' | 'org';
  owner_id: string;
  action_type: string;
  justification: string | null;
  expires_at: string;
}

export interface PolicyDraftCreatedEvent {
  policy_draft_id: string;
  agent_id: string;
  agent_principal_id: string;
  owner_type: 'user' | 'org';
  owner_id: string;
  name: string | null;
  justification: string | null;
}

export interface OrgMemberAddedEvent {
  org_id: string;
  org_display_name: string;
  user_principal_id: string;
  role: string;
  invited_by_user_id: string | null;
}

export interface OrgInviteCreatedEvent {
  invite_id: string;
  org_id: string;
  org_display_name: string;
  user_principal_id: string;
  role: string;
  invited_by_user_id: string;
  expires_at: string;
}

export interface OrgMemberRemovedEvent {
  org_id: string;
  org_display_name: string;
  user_principal_id: string;
  removed_by_user_id: string | null;
}

export interface ContactVerificationRequestedEvent {
  contact_id: string;
  type: string;
  value: string;
  owner_type: 'user' | 'org';
  owner_id: string;
  requested_by_user_id: string;
}

export interface UserSetupInviteCreatedEvent {
  invite_id: string;
  invite_token: string;
  user_principal_id: string;
  display_name: string;
  email: string | null;
  expires_at: string;
  created_by_user_id: string | null;
}

export interface ApprovalRequestResolvedEvent {
  approval_request_id: string;
  decision_id: string;
  agent_id: string;
  agent_principal_id: string;
  owner_type: 'user' | 'org';
  owner_id: string;
  action_type: string;
  /** Final status after the owner acted (or the request lapsed). */
  status: 'APPROVED' | 'DENIED' | 'EXPIRED';
  resolved_by: string | null;
}

/**
 * Fired for every audit entry as it is appended. Carries the routing fields a
 * live consumer (e.g. the SSE stream backing the agent activity drawer) needs
 * to decide which owner the entry concerns, without re-reading the log.
 */
export interface AuditAppendedEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  principal_id: string | null;
  /** Pulled out of metadata_json for convenient routing. */
  agent_principal_id: string | null;
  owner_type: 'user' | 'org' | null;
  owner_id: string | null;
  user_principal_id: string | null;
}

export interface OpenleashEventMap {
  'approval_request.created': ApprovalRequestCreatedEvent;
  'approval_request.resolved': ApprovalRequestResolvedEvent;
  'audit.appended': AuditAppendedEvent;
  'policy_draft.created': PolicyDraftCreatedEvent;
  'org_invite.created': OrgInviteCreatedEvent;
  'org_member.added': OrgMemberAddedEvent;
  'org_member.removed': OrgMemberRemovedEvent;
  'contact_verification.requested': ContactVerificationRequestedEvent;
  'user_setup_invite.created': UserSetupInviteCreatedEvent;
}

// ─── Typed event emitter ────────────────────────────────────────────

export class OpenleashEvents {
  private emitter = new EventEmitter();

  constructor() {
    // Each live SSE connection registers its own listeners; lift Node's
    // default 10-listener cap so many concurrent streams don't warn.
    this.emitter.setMaxListeners(0);
  }

  on<K extends keyof OpenleashEventMap>(
    event: K,
    listener: (data: OpenleashEventMap[K]) => void,
  ): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof OpenleashEventMap>(
    event: K,
    listener: (data: OpenleashEventMap[K]) => void,
  ): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof OpenleashEventMap>(
    event: K,
    data: OpenleashEventMap[K],
  ): void {
    this.emitter.emit(event, data);
  }
}
