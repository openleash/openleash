import type { ApprovalWaitResult, AuthClient } from './types.js';
import { log } from './logger.js';

/**
 * Handles the REQUIRE_APPROVAL decision flow:
 *
 * 1. Creates a pending approval request via OpenLeash API.
 * 2. Polls for the owner's decision up to `timeoutMs`.
 * 3. Returns a typed result: APPROVED (with token), DENIED, or TIMEOUT.
 *
 * Callers are responsible for re-authorising with the approval token and
 * forwarding to upstream on APPROVED.
 */
export async function waitForApproval(params: {
  auth: AuthClient;
  decisionId: string;
  action: Record<string, unknown>;
  toolName: string;
  actionType: string;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<ApprovalWaitResult> {
  const { auth, decisionId, action, toolName, actionType, timeoutMs, pollIntervalMs } = params;

  // Step 1: persist the approval request
  let approvalRequestId: string;
  try {
    const created = await auth.createApprovalRequest(
      decisionId,
      action,
      `MCP tool call '${toolName}' (${actionType}) requires owner approval`,
    );
    approvalRequestId = created.approval_request_id;
  } catch (err) {
    // If we can't create the request, surface as a timeout so the caller
    // returns a structured error rather than hanging indefinitely.
    log('warn', 'Failed to create approval request', { toolName, error: String(err) });
    throw err;
  }

  log('info', 'Approval request created — waiting for owner decision', {
    tool: toolName,
    action_type: actionType,
    approval_request_id: approvalRequestId,
    timeout_ms: timeoutMs,
  });

  // Step 2: poll
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    let status: string;
    let approvalToken: string | undefined;

    try {
      const check = await auth.getApprovalRequest(approvalRequestId);
      status = check.status;
      approvalToken = check.approval_token;
    } catch (err) {
      // Transient network error — keep polling
      log('warn', 'Error polling approval request', { approval_request_id: approvalRequestId, error: String(err) });
      continue;
    }

    if (status === 'APPROVED' && approvalToken) {
      log('info', 'Approval granted', { approval_request_id: approvalRequestId, tool: toolName });
      return { outcome: 'APPROVED', approvalToken };
    }

    if (status === 'DENIED') {
      log('info', 'Approval denied', { approval_request_id: approvalRequestId, tool: toolName });
      return { outcome: 'DENIED', approvalRequestId };
    }

    if (status === 'EXPIRED') {
      log('info', 'Approval request expired', { approval_request_id: approvalRequestId });
      return { outcome: 'TIMEOUT', approvalRequestId };
    }

    // status === 'PENDING' → keep polling
    log('debug', 'Approval still pending', {
      approval_request_id: approvalRequestId,
      remaining_ms: Math.max(0, deadline - Date.now()),
    });
  }

  log('warn', 'Approval wait timed out', {
    approval_request_id: approvalRequestId,
    timeout_ms: timeoutMs,
  });
  return { outcome: 'TIMEOUT', approvalRequestId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
