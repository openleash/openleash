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

export interface OpenleashEventMap {
  'approval_request.created': ApprovalRequestCreatedEvent;
  'policy_draft.created': PolicyDraftCreatedEvent;
  'org_invite.created': OrgInviteCreatedEvent;
  'org_member.added': OrgMemberAddedEvent;
  'org_member.removed': OrgMemberRemovedEvent;
}

// ─── Typed event emitter ────────────────────────────────────────────

export class OpenleashEvents {
  private emitter = new EventEmitter();

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
