// ─── Glove configuration ─────────────────────────────────────────────────────

export interface GloveConfig {
  /** MCP server name advertised to downstream clients. Must match the upstream's
   *  logical name for transparency — e.g. "office365-outlook". */
  serverName: string;

  /** Executable for the upstream MCP server process (e.g. "npx"). */
  upstreamCmd: string;

  /** Arguments for the upstream command (e.g. ["-y", "@jbctechsolutions/mcp-outlook-mac"]). */
  upstreamArgs: string[];

  /** Extra environment variables forwarded to the upstream process. */
  upstreamEnv: Record<string, string>;

  /** Named profile driving tool→action mapping logic. "office365-outlook" for Phase-1. */
  profile: string;

  /** OpenLeash server base URL. */
  openleashUrl: string;

  /** Agent ID registered with OpenLeash. */
  agentId: string;

  /** Ed25519 PKCS#8 DER private key in base64 (for request signing). */
  privateKeyB64: string;

  /** Owner principal UUID (subject.principal_id in authorization requests). */
  subjectId: string;

  /** Milliseconds to wait for owner approval before timing out. Default 120 000. */
  approvalTimeoutMs: number;

  /** Polling interval while waiting for approval decision. Default 5 000. */
  approvalPollIntervalMs: number;
}

// ─── Authorization result ────────────────────────────────────────────────────

export interface AuthorizeResult {
  decision_id: string;
  action_id: string;
  action_hash: string;
  result: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'REQUIRE_STEP_UP' | 'REQUIRE_DEPOSIT';
  matched_rule_id: string | null;
  reason: string;
  proof_token: string | null;
  proof_expires_at: string | null;
  obligations: unknown[];
}

export interface CreateApprovalResult {
  approval_request_id: string;
  status: string;
  expires_at: string;
}

export interface GetApprovalResult {
  approval_request_id: string;
  status: string;
  approval_token?: string;
  approval_token_expires_at?: string;
}

// ─── Auth client interface (dependency-injectable for testing) ───────────────

export interface AuthClient {
  authorize(
    action: Record<string, unknown>,
    approvalToken?: string,
  ): Promise<AuthorizeResult>;

  createApprovalRequest(
    decisionId: string,
    action: Record<string, unknown>,
    justification?: string,
  ): Promise<CreateApprovalResult>;

  getApprovalRequest(approvalRequestId: string): Promise<GetApprovalResult>;
}

// ─── Upstream bridge interface (dependency-injectable for testing) ───────────

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: ContentBlock[];
  isError?: boolean;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface UpstreamBridge {
  listTools(): Promise<{ tools: ToolDefinition[] }>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  close(): Promise<void>;
}

// ─── Structured error payloads ───────────────────────────────────────────────

export interface GloveDenyError {
  code: 'OPENLEASH_DENY';
  message: string;
  action_type: string;
  tool_name: string;
  reason?: string;
  policy_id?: string;
  action_id?: string;
}

export interface GloveApprovalDeniedError {
  code: 'OPENLEASH_APPROVAL_DENIED';
  message: string;
  action_type: string;
  tool_name: string;
  approval_request_id: string;
}

export interface GloveApprovalTimeoutError {
  code: 'OPENLEASH_APPROVAL_TIMEOUT';
  message: string;
  action_type: string;
  tool_name: string;
  approval_request_id: string;
}

export interface GloveAuthErrorPayload {
  code: 'OPENLEASH_AUTH_ERROR';
  message: string;
  action_type: string;
  tool_name: string;
  error: string;
}

export type GloveErrorPayload =
  | GloveDenyError
  | GloveApprovalDeniedError
  | GloveApprovalTimeoutError
  | GloveAuthErrorPayload;

// ─── Approval wait result ────────────────────────────────────────────────────

export type ApprovalWaitResult =
  | { outcome: 'APPROVED'; approvalToken: string }
  | { outcome: 'DENIED'; approvalRequestId: string }
  | { outcome: 'TIMEOUT'; approvalRequestId: string };
