import * as crypto from 'node:crypto';
import { appendAuditEvent } from './audit.js';
import type { AuditStore } from './audit.js';

export interface WebhookPayload {
  event_type:
    | 'approval_request.approved'
    | 'approval_request.denied'
    | 'policy_draft.approved'
    | 'policy_draft.denied';
  timestamp: string;
  agent_principal_id: string;
  data: Record<string, unknown>;
}

function safeAuditStore(auditStore: AuditStore, eventType: string, metadata: Record<string, unknown>): void {
  try {
    auditStore.append(eventType, metadata);
  } catch {
    // Audit store may no longer be available (e.g. tests cleaned up)
  }
}

/** @deprecated Use the overload that accepts `auditStore` instead of `dataDir`. */
function safeAudit(dataDir: string, eventType: string, metadata: Record<string, unknown>): void {
  try {
    appendAuditEvent(dataDir, eventType, metadata);
  } catch {
    // Data directory may no longer exist (e.g. tests cleaned up)
  }
}

export function deliverWebhook(params: {
  webhookUrl: string;
  webhookSecret: string;
  webhookAuthToken: string;
  payload: WebhookPayload;
  auditStore: AuditStore;
  timeoutMs?: number;
}): void;
/** @deprecated Use the overload that accepts `auditStore` instead of `dataDir`. */
export function deliverWebhook(params: {
  webhookUrl: string;
  webhookSecret: string;
  webhookAuthToken: string;
  payload: WebhookPayload;
  dataDir: string;
  timeoutMs?: number;
}): void;
export function deliverWebhook(params: {
  webhookUrl: string;
  webhookSecret: string;
  webhookAuthToken: string;
  payload: WebhookPayload;
  auditStore?: AuditStore;
  dataDir?: string;
  timeoutMs?: number;
}): void {
  const { webhookUrl, webhookSecret, webhookAuthToken, payload, auditStore, dataDir, timeoutMs = 10_000 } = params;
  if (!webhookUrl) return;
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const audit = (eventType: string, metadata: Record<string, unknown>) => {
    if (auditStore) {
      safeAuditStore(auditStore, eventType, metadata);
    } else if (dataDir) {
      safeAudit(dataDir, eventType, metadata);
    }
  };

  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      Authorization: `Bearer ${webhookAuthToken}`,
    },
    body,
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(timer);
      if (res.ok) {
        audit('WEBHOOK_DELIVERED', {
          webhook_url: webhookUrl,
          event_type: payload.event_type,
          agent_principal_id: payload.agent_principal_id,
          status_code: res.status,
        });
      } else {
        audit('WEBHOOK_DELIVERY_FAILED', {
          webhook_url: webhookUrl,
          event_type: payload.event_type,
          agent_principal_id: payload.agent_principal_id,
          status_code: res.status,
        });
      }
    })
    .catch((err: unknown) => {
      clearTimeout(timer);
      audit('WEBHOOK_DELIVERY_FAILED', {
        webhook_url: webhookUrl,
        event_type: payload.event_type,
        agent_principal_id: payload.agent_principal_id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
