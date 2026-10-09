# Audit Log Export

OpenLeash records every authorization decision, approval, policy change, membership change and login in an append-only audit log. The audit export lets a user or an organization pull that log into their own tooling — a SIEM (Splunk, Elastic, Datadog, Sentinel, AWS Security Lake, …), a data lake, or a script — in the [OCSF](https://schema.ocsf.io/1.3.0) standard format or OpenLeash's native format.

- **Pull-based and incremental.** You poll an endpoint with a cursor and receive only events you haven't seen.
- **Machine credentials.** Integrations authenticate with long-lived, scoped **API keys** instead of a human login session.
- **Owner-scoped.** A personal key reads your personal audit trail; an organization key reads the organization's.

## Quick start

1. In the owner portal, open **API Keys** (personal sidebar, or the organization's sidebar — org keys require the `org_admin` role) and click **New API Key**.
2. Copy the key. It looks like `ola_<api_key_id>.<secret>` and is shown **only once**.
3. Fetch events:

```bash
export OPENLEASH_API_KEY='ola_…'

# Organization audit log, from the beginning of yesterday
curl -s -H "Authorization: Bearer $OPENLEASH_API_KEY" \
  "https://openleash.example.com/v1/owner/organizations/<org_id>/audit/export?since=2026-10-08T00:00:00Z"
```

```json
{
  "format": "ocsf",
  "items": [ { "class_uid": 6003, "time": 1759924800000, "...": "..." } ],
  "next_cursor": "eyJ2IjoxLCJlIjoi…",
  "has_more": false
}
```

4. Save `next_cursor` and send it back as `cursor` on the next poll to receive only new events.

## API keys

API keys are machine credentials owned by a **user** or an **organization**.

| | Personal keys | Organization keys |
|---|---|---|
| Create | any user | `org_admin` |
| List | the owner | any active member |
| Revoke | the owner | `org_admin` |
| Reads | `GET /v1/owner/audit/export` | `GET /v1/owner/organizations/{orgId}/audit/export` |

- **Format:** `ola_<api_key_id>.<secret>`, sent as `Authorization: Bearer ola_…`. Only a scrypt hash of the secret is stored; a lost key cannot be recovered — revoke it and create a new one.
- **Scopes:** a key can only do what its scopes allow. Currently the only scope is `audit:read` (the audit export endpoints). Keys are rejected on every other endpoint.
- **Lifetime:** keys do not expire. They stop working when revoked, or when the owning user or organization is no longer active. An organization key keeps working if the admin who created it leaves the organization.
- **Tracking:** `last_used_at` is updated (at most every five minutes) so stale keys are easy to spot. Creating and revoking keys is itself audited (`API_KEY_CREATED`, `API_KEY_REVOKED`).

Key management API (owner session required):

```
POST   /v1/owner/api-keys                                  { "name": "splunk-prod" }
GET    /v1/owner/api-keys
DELETE /v1/owner/api-keys/{apiKeyId}

POST   /v1/owner/organizations/{orgId}/api-keys            { "name": "splunk-prod", "scopes": ["audit:read"] }
GET    /v1/owner/organizations/{orgId}/api-keys
DELETE /v1/owner/organizations/{orgId}/api-keys/{apiKeyId}
```

## Export endpoints

```
GET /v1/owner/audit/export
GET /v1/owner/organizations/{orgId}/audit/export
```

Both accept an API key belonging to that exact owner, **or** a normal owner session (handy for one-off downloads; org exports are open to any active member).

| Parameter | Default | Description |
|---|---|---|
| `cursor` | — | Opaque cursor from a previous response's `next_cursor`. |
| `since` | — | ISO 8601 timestamp. Without a cursor, start at the first event at or after this time. Without either, start at the beginning of the log. |
| `limit` | `500` | Maximum events per page (1–1000). |
| `format` | `ocsf` | `ocsf` or `native`. |
| `output` | `json` | `json` (envelope) or `ndjson` (one event per line). `Accept: application/x-ndjson` also selects NDJSON. |

### Paging and polling

- Events are returned **oldest first**.
- The cursor is anchored to an event, not an offset, so new events never shift your position.
- `next_cursor` is returned even when a page is empty — store it and poll again later. It is `null` only when nothing has been read yet (empty log and no cursor supplied); retry with the same parameters.
- `has_more: true` means more events are available right now; fetch again immediately. A page can contain fewer than `limit` events while `has_more` is true.
- With `output=ndjson` the cursor is in the `OpenLeash-Next-Cursor` response header and the flag in `OpenLeash-Has-More`.

### Errors

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_CURSOR`, `INVALID_REQUEST` | Malformed cursor, `since`, `format` or `output`. |
| 401 | `API_KEY_UNAUTHORIZED`, `API_KEY_REVOKED`, `API_KEY_OWNER_INACTIVE`, `MISSING_TOKEN` | Bad or missing credentials. |
| 403 | `API_KEY_SCOPE_MISSING`, `FORBIDDEN` | Key lacks `audit:read`, belongs to a different owner, or the session user isn't a member. |
| 410 | `CURSOR_EXPIRED` | The cursor's event no longer exists. Restart with `since`. |

## What's included

An owner's export contains:

- events about the owner itself — logins, profile and MFA changes, organization settings, memberships and invites, API keys, provisioners;
- events about the owner's agents — authorization requests, decisions, proofs, approval requests, policy drafts, webhook deliveries;
- policy, policy group and output transformation changes.

**Ownership is fixed when the event is written.** Each event about an agent records the agent's owner at that moment. If an agent is transferred, its earlier history stays in the previous owner's export and its new events go to the new owner; the transfer event itself appears in both.

## OCSF format

Each event is mapped to an [OCSF 1.3.0](https://schema.ocsf.io/1.3.0) class:

| OpenLeash events | OCSF class | Activity |
|---|---|---|
| `USER_LOGIN`, `USER_LOGOUT` | Authentication (3002) | Logon / Logoff |
| `USER_CREATED`, `USER_DELETED`, `USER_TOTP_ENABLED`, `USER_TOTP_DISABLED`, `USER_RECOVERY_REQUESTED`, other `USER_*` | Account Change (3001) | Create / Delete / MFA Factor Enable / MFA Factor Disable / Password Reset / Other |
| `ORG_CREATED`, `ORG_DELETED`, `ORG_MEMBER_*`, `ORG_INVITE_*`, `ORG_UPDATED` | Group Management (3006) | Create / Delete / Add User / Remove User / Assign Privileges / Other |
| `AGENT_*`, `POLICY_*`, `POLICY_GROUP_*`, `POLICY_DRAFT_*`, `PROVISIONER_*`, `TRANSFORMATION_*`, `API_KEY_*`, `APPROVAL_REQUEST_*`, `KEY_ROTATED` | Entity Management (3004) | Create / Update / Delete, inferred from the event suffix |
| `AUTHORIZE_CALLED`, `DECISION_CREATED`, `APPROVAL_TOKEN_USED`, `PROOF_ISSUED`, `PROOF_VERIFIED`, `WEBHOOK_*` | API Activity (6003) | Other, with `activity_name` describing the event |
| anything else | Base Event (0) | Other |

Common fields on every event:

- `time` (epoch ms), `severity_id`, `status_id`, `message`, `type_uid` (`class_uid * 100 + activity_id`)
- `metadata.uid` — the OpenLeash `event_id` (use it to deduplicate)
- `metadata.event_code` — the native event type, e.g. `DECISION_CREATED`
- `metadata.correlation_uid` — the `decision_id`, linking a request, its decision, proof and approval
- `metadata.product` — `{ name: "OpenLeash", vendor_name: "OpenLeash", version }`
- `actor.user` — the acting user, or the agent (`type: "Agent"`, `name` = agent id)
- `unmapped` — the complete native event (`event_type`, `principal_id`, `action_id`, `decision_id`, `metadata`), so nothing is lost in translation

Authorization decisions (`DECISION_CREATED`) also carry the OCSF Security Control profile attributes:

| Result | `action_id` | `disposition_id` | `status_id` | `severity_id` |
|---|---|---|---|---|
| `ALLOW` | 1 Allowed | 1 Allowed | 1 Success | 1 Informational |
| `DENY` | 2 Denied | 2 Blocked | 2 Failure | 2 Low |
| `REQUIRE_APPROVAL` / `REQUIRE_STEP_UP` / `REQUIRE_DEPOSIT` | 99 Other | 99 Other | 99 Other | 1 Informational |

`api.operation` holds the agent's `action_type` (e.g. `payments.send`).

Example:

```json
{
  "class_uid": 6003,
  "class_name": "API Activity",
  "category_uid": 6,
  "activity_id": 99,
  "activity_name": "Decision",
  "type_uid": 600399,
  "time": 1759924800000,
  "severity_id": 1,
  "status_id": 1,
  "action_id": 1,
  "disposition_id": 1,
  "message": "Authorization decision ALLOW by agent acme-bot for action payments.send",
  "metadata": {
    "version": "1.3.0",
    "uid": "6f1c…",
    "event_code": "DECISION_CREATED",
    "correlation_uid": "a2e9…",
    "profiles": ["security_control"],
    "product": { "name": "OpenLeash", "vendor_name": "OpenLeash", "version": "0.27.0" }
  },
  "actor": { "user": { "uid": "3b7d…", "name": "acme-bot", "type": "Agent" } },
  "api": { "operation": "payments.send" },
  "unmapped": { "event_type": "DECISION_CREATED", "metadata": { "result": "ALLOW", "...": "..." } }
}
```

## Native format

`format=native` returns OpenLeash's own `AuditEvent` records unchanged:

```json
{
  "event_id": "6f1c…",
  "timestamp": "2026-10-08T12:00:00.000Z",
  "event_type": "DECISION_CREATED",
  "principal_id": "3b7d…",
  "action_id": "…",
  "decision_id": "a2e9…",
  "metadata_json": { "result": "ALLOW", "action_type": "payments.send", "owner_type": "org", "owner_id": "…" }
}
```

## Connecting a collector

Most log shippers poll static URLs and can't carry a cursor between requests, so the simplest reliable setup is a small poller that appends NDJSON to a file, which your existing agent (Splunk Universal Forwarder, Vector, Fluent Bit, Elastic Agent, Datadog Agent, …) tails:

```bash
#!/usr/bin/env bash
# openleash-audit-poll.sh — append new OpenLeash audit events (OCSF NDJSON) to a file.
set -euo pipefail
BASE="https://openleash.example.com/v1/owner/organizations/<org_id>/audit/export"
OUT=/var/log/openleash/audit.ocsf.ndjson
STATE=/var/lib/openleash/audit.cursor

while true; do
  cursor=$(cat "$STATE" 2>/dev/null || true)
  query="output=ndjson&limit=1000"
  if [ -n "$cursor" ]; then query="$query&cursor=$cursor"; else query="$query&since=$(date -u -d '-1 day' +%FT%TZ)"; fi

  headers=$(mktemp)
  curl -sf -D "$headers" -H "Authorization: Bearer $OPENLEASH_API_KEY" "$BASE?$query" >> "$OUT"

  next=$(grep -i '^openleash-next-cursor:' "$headers" | cut -d' ' -f2 | tr -d '\r' || true)
  more=$(grep -i '^openleash-has-more:' "$headers" | cut -d' ' -f2 | tr -d '\r' || true)
  rm -f "$headers"
  [ -n "$next" ] && echo "$next" > "$STATE"

  # Drain backlogs immediately; otherwise poll once a minute.
  [ "$more" = "true" ] || sleep 60
done
```

The cursor is written only after the page has been appended, so a crash can at worst re-deliver one page — deduplicate on `metadata.uid` (OCSF) or `event_id` (native) if exactly-once matters.

## Security notes

- Treat API keys like passwords: keep them in your collector's secret store, give each integration its own key, and revoke keys you no longer use.
- Exported events can contain action payloads that agents submitted for authorization (`AUTHORIZE_CALLED` → `unmapped.metadata.payload`). Apply the same handling rules to your SIEM index as to the data your agents process.
- The export is read-only. An `audit:read` key cannot change policies, act as an agent, or read anything other than the owner's audit trail.

## Storage notes

**File store (self-hosted default).** Keys live in `data/api-keys/<api_key_id>.json` (hash only) and the export is served from an in-memory index of `data/audit.log.jsonl`. New events are visible immediately.

**Firestore store (hosted).** API keys are kept in sync across server instances with a live listener, so revocation takes effect everywhere within about a second. Export reads query Firestore directly, and events are held back for about **5 seconds** after they are written so that writes landing late from other instances are never skipped. An event can therefore take a few seconds to appear in the export.

**Store plugins.** A `DataStore` plugin may implement `AuditStore.readByPrincipalsAfter()` (sync or async) for efficient cursor reads. A store that filters a shared collection in memory should return `scanned_to` so the cursor advances past events that belong to other owners. Stores without it are served by a slower fallback that scans newest-first back to the cursor.
