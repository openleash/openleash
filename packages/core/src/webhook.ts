import * as crypto from 'node:crypto';
import { appendAuditEvent } from './audit.js';

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
  payload: WebhookPayload;
  dataDir: string;
  timeoutMs?: number;
}): void {
  const { webhookUrl, webhookSecret, payload, dataDir, timeoutMs = 10_000 } = params;
  if (!webhookUrl) return;
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      Authorization: `Bearer ${webhookSecret}`,
    },
    body,
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(timer);
      if (res.ok) {
        safeAudit(dataDir, 'WEBHOOK_DELIVERED', {
          webhook_url: webhookUrl,
          event_type: payload.event_type,
          agent_principal_id: payload.agent_principal_id,
          status_code: res.status,
        });
      } else {
        safeAudit(dataDir, 'WEBHOOK_DELIVERY_FAILED', {
          webhook_url: webhookUrl,
          event_type: payload.event_type,
          agent_principal_id: payload.agent_principal_id,
          status_code: res.status,
        });
      }
    })
    .catch((err: unknown) => {
      clearTimeout(timer);
      safeAudit(dataDir, 'WEBHOOK_DELIVERY_FAILED', {
        webhook_url: webhookUrl,
        event_type: payload.event_type,
        agent_principal_id: payload.agent_principal_id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
