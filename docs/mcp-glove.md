# mcp-glove — Transparent MCP Governance Proxy

`mcp-glove` is an OpenLeash module that sits between an MCP client (e.g. OpenClaw / mcporter) and a real MCP server process, transparently enforcing OpenLeash policy on every tool call.

**Phase-1 scope:** `office365-outlook` (mcporter-backed), covering the `prepare-interview-email` workflow tools.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Agent / OpenClaw / mcporter                                      │
│  (still calls "office365-outlook.<tool>" — no code changes)      │
└────────────────────────┬─────────────────────────────────────────┘
                         │  stdio JSON-RPC (MCP)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  mcp-glove  (this package)                                        │
│                                                                   │
│   ┌──────────────────┐       ┌────────────────────────────────┐  │
│   │  MCP Server      │       │  OpenLeash Authorization       │  │
│   │  (StdioTransport)│──────▶│  /v1/authorize  (ALLOW/DENY/   │  │
│   │  name: office365 │       │  REQUIRE_APPROVAL)             │  │
│   └──────────────────┘       └────────────────────────────────┘  │
│           │ forward on ALLOW                                      │
│           ▼                                                       │
│   ┌──────────────────┐                                           │
│   │  Upstream Bridge  │  spawns upstream MCP process via stdio   │
│   │  (MCP Client)     │                                          │
│   └──────────────────┘                                           │
└──────────────────────────────────────────────────────────────────┘
                         │  stdio JSON-RPC (MCP)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Real upstream MCP server                                         │
│  npx -y @jbctechsolutions/mcp-outlook-mac                        │
└──────────────────────────────────────────────────────────────────┘
```

### Transparency guarantee

The glove advertises itself with `serverName = "office365-outlook"` (configurable). Downstream agents see no difference: tool names, result shapes, and the server name are all identical to calling the upstream directly.

---

## Setup

### Prerequisites

1. OpenLeash server running (`openleash start`)
2. Agent registered and policy configured (`openleash wizard`)
3. `mcp-glove` installed (part of the `@openleash/mcp-glove` package)

### Quick start via wizard

Run `openleash wizard` and answer **Yes** when prompted:

```
Enable MCP Glove for office365-outlook (transparent policy enforcement proxy)?
```

The wizard outputs a ready-to-paste `mcpServers` JSON block for your MCP client config (e.g. `claude_desktop_config.json`).

### Manual setup

Replace the existing `office365-outlook` entry in your MCP client config with:

```json
{
  "mcpServers": {
    "office365-outlook": {
      "command": "mcp-glove",
      "args": ["start"],
      "env": {
        "OPENLEASH_SERVER_NAME": "office365-outlook",
        "OPENLEASH_UPSTREAM_CMD": "npx -y @jbctechsolutions/mcp-outlook-mac",
        "OPENLEASH_GLOVE_PROFILE": "office365-outlook",
        "OPENLEASH_URL": "http://127.0.0.1:8787",
        "OPENLEASH_AGENT_ID": "<your-agent-id>",
        "OPENLEASH_AGENT_PRIVATE_KEY_B64": "<your-private-key-b64>",
        "OPENLEASH_SUBJECT_ID": "<owner-principal-uuid>",
        "OPENLEASH_APPROVAL_TIMEOUT_MS": "120000"
      }
    }
  }
}
```

The original upstream command is preserved in `OPENLEASH_UPSTREAM_CMD`. To disable the glove, swap `command` and `args` back to the upstream command directly.

### CLI reference

```
mcp-glove start [options]

Options:
  --server-name <name>         MCP server name (default: office365-outlook)
  --upstream-cmd <cmd>         Full command to spawn upstream MCP server
  --profile <name>             Mapping profile (default: office365-outlook)
  --agent-id <id>              OpenLeash agent ID
  --private-key-b64 <key>      Ed25519 private key (base64)
  --subject-id <uuid>          Owner principal UUID
  --approval-timeout-ms <ms>   Approval wait timeout in ms (default: 120000)

Environment variables (override flags):
  OPENLEASH_SERVER_NAME, OPENLEASH_UPSTREAM_CMD, OPENLEASH_UPSTREAM_ENV (JSON),
  OPENLEASH_GLOVE_PROFILE, OPENLEASH_URL, OPENLEASH_AGENT_ID,
  OPENLEASH_AGENT_PRIVATE_KEY_B64, OPENLEASH_SUBJECT_ID,
  OPENLEASH_APPROVAL_TIMEOUT_MS, OPENLEASH_APPROVAL_POLL_INTERVAL_MS
```

---

## Policy action mapping (office365-outlook profile)

| MCP tool | OpenLeash action type | Auth required |
|---|---|---|
| `create_draft` | `communication.draft.create` | yes |
| `update_draft` | `communication.draft.update` | yes |
| `prepare_send_draft` | `communication.send.prepare` | yes |
| `confirm_send_draft` | `communication.send.confirm` | yes |
| `send_email` | `communication.send` | yes |
| *(any other tool)* | *(passthrough)* | no |

Read-only tools (e.g. `get_email`, `list_emails`) pass through to upstream without an auth check.

### Payload fields sent to OpenLeash

The glove extracts **structural metadata** — not raw message content — to keep the policy payload lean:

| Field | Source |
|---|---|
| `tool` | tool name |
| `recipient_count` | number of `to_recipients` |
| `recipient_domains` | unique email domains |
| `subject_length` / `subject_word_count` | string length + word count |
| `has_body` / `body_length` | body presence + length |
| `draft_id` | `draft_id` / `message_id` / `id` arg |
| `attachment_count` | `attachments` array length |
| `cc_count` / `bcc_count` | CC/BCC recipient counts |

---

## Decision handling

### ALLOW

Upstream tool call is forwarded and the result returned to the agent unchanged.

### DENY

Upstream is **never called**. The agent receives a structured MCP tool error:

```json
{
  "code": "OPENLEASH_DENY",
  "message": "Domain not in allowlist",
  "action_type": "communication.send",
  "tool_name": "send_email",
  "action_id": "...",
  "reason": "Domain not in allowlist"
}
```

### REQUIRE_APPROVAL

1. Glove creates a pending approval request via `/v1/agent/approval-requests`.
2. Tool call **suspends** — the glove polls for the owner's decision (visible in the OpenLeash dashboard or owner portal).
3. On **APPROVED**: glove re-authorises with the approval token, then forwards to upstream.
4. On **DENIED**: error with `code: "OPENLEASH_APPROVAL_DENIED"`.
5. On **timeout** (`approvalTimeoutMs`): error with `code: "OPENLEASH_APPROVAL_TIMEOUT"`.

Default timeout: 120 seconds (configurable via `OPENLEASH_APPROVAL_TIMEOUT_MS`).

### Auth service unavailable

Fail-safe: write tools are **denied** with `code: "OPENLEASH_AUTH_ERROR"`. The glove never blindly allows a covered tool if auth is unreachable.

---

## Structured error reference

| `code` | Meaning |
|---|---|
| `OPENLEASH_DENY` | Policy denied the action |
| `OPENLEASH_APPROVAL_DENIED` | Owner explicitly denied the approval request |
| `OPENLEASH_APPROVAL_TIMEOUT` | Owner did not respond within `approvalTimeoutMs` |
| `OPENLEASH_AUTH_ERROR` | OpenLeash auth service unreachable / error |

All errors are returned as MCP tool results with `isError: true` and a JSON text block, making them machine-readable by the calling agent.

---

## Observability

The glove writes structured JSONL to **stderr** (never stdout, which is reserved for the MCP protocol stream). Each line is a JSON object with at minimum `ts`, `level`, `msg`.

Key log events:

| `msg` | When |
|---|---|
| `mcp-glove started` | Startup |
| `Passthrough (read-only or uncovered tool)` | Read-only tool forwarded |
| `Authorization decision` | Every auth check result (includes `decision`, `action_id`) |
| `Approval request created — waiting for owner decision` | REQUIRE_APPROVAL suspended |
| `Approval granted` | Owner approved |
| `Approval denied` | Owner denied |
| `Approval wait timed out` | Timeout reached |
| `Auth check failed — denying (fail-safe)` | Auth service error |

---

## Known limitations (Phase-1)

1. **Only `office365-outlook` tools are covered.** Other MCP server tools pass through without policy enforcement.
2. **`REQUIRE_STEP_UP` and `REQUIRE_DEPOSIT` decisions are treated as `DENY`.** Step-up auth and deposit flows are not supported yet.
3. **No streaming / progress notification support.** Long-running tool calls with progress events are proxied but progress notifications from upstream are not forwarded.
4. **No tool filtering.** The full upstream tool list is returned to downstream clients, including tools the glove does not intercept.
5. **Approval wait blocks the MCP call.** The agent's tool call is synchronously suspended while waiting. Agent runtimes with short MCP timeouts may need `OPENLEASH_APPROVAL_TIMEOUT_MS` reduced accordingly.

---

## End-to-end demo transcript

The following shows all three decision paths for `send_email`:

### ALLOW (low-risk draft creation)

```
Agent → mcp-glove: tools/call create_draft {to: alice@acme.com, subject: "Interview"}

mcp-glove → OpenLeash /v1/authorize:
  action_type: communication.draft.create
  payload: {recipient_count: 1, recipient_domains: ["acme.com"], ...}

OpenLeash → ALLOW (matched rule: allow-known-domains)

mcp-glove → upstream: create_draft {to: alice@acme.com, subject: "Interview"}
upstream → {id: "draft-999", status: "created"}

mcp-glove → Agent: {content: [{type: "text", text: "{\"id\":\"draft-999\",...}"}]}
```

### DENY (blocked domain)

```
Agent → mcp-glove: tools/call send_email {to: hacker@blocked.io, subject: "Exfil"}

mcp-glove → OpenLeash /v1/authorize:
  action_type: communication.send
  payload: {recipient_count: 1, recipient_domains: ["blocked.io"]}

OpenLeash → DENY (rule: block-external-domains)

mcp-glove → Agent: {isError: true, content: [{type: "text", text: '{"code":"OPENLEASH_DENY","tool_name":"send_email","action_type":"communication.send","message":"Domain blocked.io is not in the allowlist"}'}]}

(upstream never called)
```

### REQUIRE_APPROVAL (external domain send)

```
Agent → mcp-glove: tools/call confirm_send_draft {draft_id: "draft-999"}

mcp-glove → OpenLeash /v1/authorize:
  action_type: communication.send.confirm

OpenLeash → REQUIRE_APPROVAL

mcp-glove creates approval request ar-42, status=PENDING
mcp-glove polls every 5s... (visible in OpenLeash dashboard)

[Owner views request in dashboard and clicks Approve]

mcp-glove polls → status=APPROVED, approval_token="v4.public...."
mcp-glove → OpenLeash /v1/authorize (with approval_token) → ALLOW

mcp-glove → upstream: confirm_send_draft {draft_id: "draft-999"}
upstream → {status: "sent"}

mcp-glove → Agent: {content: [{type: "text", text: "{\"status\":\"sent\"}"}]}
```
