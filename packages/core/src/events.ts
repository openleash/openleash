import { EventEmitter } from 'node:events';

// ─── Event payload types ────────────────────────────────────────────

export interface ApprovalRequestCreatedEvent {
  approval_request_id: string;
  decision_id: string;
  agent_id: string;
  agent_principal_id: string;
  owner_principal_id: string;
  action_type: string;
  justification: string | null;
  expires_at: string;
}

export interface PolicyDraftCreatedEvent {
  policy_draft_id: string;
  agent_id: string;
  agent_principal_id: string;
  owner_principal_id: string;
  name: string | null;
  justification: string | null;
}

export interface OpenleashEventMap {
  'approval_request.created': ApprovalRequestCreatedEvent;
  'policy_draft.created': PolicyDraftCreatedEvent;
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
