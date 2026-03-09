/**
 * office365-outlook profile
 *
 * Maps tool names from the office365-outlook MCP server (mcporter-backed) to
 * OpenLeash action types, and extracts policy-relevant payload fields.
 *
 * Read-only / low-risk tools are passed through without an auth check.
 * Side-effectful (write) tools are checked against OpenLeash policy before
 * being forwarded to the upstream.
 *
 * TODO(Phase-2): support more server profiles
 */

// ─── Action type mapping ─────────────────────────────────────────────────────

export const ACTION_MAP: Record<string, string> = {
  create_draft: 'communication.draft.create',
  update_draft: 'communication.draft.update',
  prepare_send_draft: 'communication.send.prepare',
  confirm_send_draft: 'communication.send.confirm',
  send_email: 'communication.send',
};

// ─── Write tools (require policy check) ─────────────────────────────────────

/**
 * Tools that have side-effects and MUST be checked against OpenLeash policy.
 * If auth is unavailable for these tools the call is denied (fail-safe).
 */
export const WRITE_TOOLS = new Set<string>([
  'create_draft',
  'update_draft',
  'prepare_send_draft',
  'confirm_send_draft',
  'send_email',
]);

// ─── Payload builder ─────────────────────────────────────────────────────────

/**
 * Extracts policy-relevant fields from the raw tool arguments and returns a
 * sanitised payload suitable for inclusion in the OpenLeash ActionRequest.
 *
 * We deliberately avoid forwarding raw message body text to keep the policy
 * payload lean and avoid logging sensitive content. Instead we extract
 * structural metadata (recipient count/domains, attachment count, etc.).
 */
export function buildPayload(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { tool: toolName };

  // ── Recipients ────────────────────────────────────────────────────────────
  const recipients = extractRecipients(args);
  if (recipients.length > 0) {
    payload.recipient_count = recipients.length;
    payload.recipient_domains = extractDomains(recipients);
  }

  // ── Subject ───────────────────────────────────────────────────────────────
  const subject = coerceString(args.subject);
  if (subject !== null) {
    payload.subject_length = subject.length;
    // Expose subject words count as a lightweight signal without raw text
    payload.subject_word_count = subject.trim().split(/\s+/).filter(Boolean).length;
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  const bodyText = coerceString(args.body ?? args.body_content ?? args.body_html);
  if (bodyText !== null) {
    payload.has_body = true;
    payload.body_length = bodyText.length;
  }

  // ── Draft / message ID ────────────────────────────────────────────────────
  const draftId = coerceString(args.draft_id ?? args.message_id ?? args.id);
  if (draftId !== null) {
    payload.draft_id = draftId;
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  if (Array.isArray(args.attachments)) {
    payload.attachment_count = args.attachments.length;
  }

  // ── CC / BCC (recipient expansion) ───────────────────────────────────────
  const ccRecipients = extractRecipientList(args.cc_recipients ?? args.cc);
  const bccRecipients = extractRecipientList(args.bcc_recipients ?? args.bcc);
  if (ccRecipients.length > 0) payload.cc_count = ccRecipients.length;
  if (bccRecipients.length > 0) payload.bcc_count = bccRecipients.length;

  return payload;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return null;
}

/**
 * Accepts various recipient shapes used by outlook MCP servers:
 * - string (single email)
 * - string[] (array of emails)
 * - { emailAddress: { address: string } }[] (Graph API shape)
 * - { address: string }[] (simplified shape)
 */
function extractRecipients(args: Record<string, unknown>): string[] {
  const raw = args.to_recipients ?? args.to ?? args.recipients ?? args.to_emails;
  return extractRecipientList(raw);
}

function extractRecipientList(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.length > 0 ? [raw] : [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.emailAddress === 'object' && obj.emailAddress !== null) {
          const ea = obj.emailAddress as Record<string, unknown>;
          if (typeof ea.address === 'string') return [ea.address];
        }
        if (typeof obj.address === 'string') return [obj.address];
        if (typeof obj.email === 'string') return [obj.email];
      }
      return [];
    });
  }
  return [];
}

function extractDomains(emails: string[]): string[] {
  const domains = new Set<string>();
  for (const email of emails) {
    const at = email.lastIndexOf('@');
    if (at !== -1) domains.add(email.slice(at + 1).toLowerCase());
  }
  return [...domains];
}
