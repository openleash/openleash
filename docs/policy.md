# openleash Policy Reference

## Schema

Policies are YAML files with this structure:

```yaml
version: 1          # always 1
default: deny       # allow | deny | passthrough | require_approval — applied when no rule matches
rules:              # ordered list of rules
  - id: rule_name
    effect: allow   # "allow" or "deny"
    action: purchase
    # ... additional fields
```

Rules are evaluated in order. The first matching rule determines the decision. If no rule matches, the `default` is used.

### `default` values

| Value | When no rule matches |
| --- | --- |
| `allow` | Decision is `ALLOW`. |
| `deny` | Decision is `DENY`. |
| `require_approval` | Decision is `REQUIRE_APPROVAL` with a `HUMAN_APPROVAL` obligation — "anything not explicitly allowed needs a human." |
| `passthrough` | The policy **abstains** from the default and defers it to the next (less specific) layer. Use this so an agent- or group-scoped policy inherits the owner-wide baseline instead of overriding it. |

`passthrough` only makes sense in a layered evaluation (see [Layering](#layering--specificity)). When the merged policy resolves its default, it walks layers most-specific first and takes the first non-`passthrough` default; if every layer is `passthrough` (or a `passthrough` policy is evaluated alone), it fails safe to `deny`.

Full JSON Schema: [docs/policy.schema.json](./policy.schema.json)

## Layering & specificity

Policies are connected to owners and agents through **bindings** stored in `state.md`. Unlike a single first-match lookup, **all** of an owner's bindings that apply to the requesting agent are collected and layered into one effective policy. Each binding falls into one of three specificity tiers:

1. **Agent-specific** — `applies_to_agent_principal_id` equals the requesting agent.
2. **Group** — `applies_to_group_id` is a group the agent belongs to.
3. **Owner-wide** — both are `null` ("all agents for this owner").

Bindings are ordered **agent-specific → group → owner-wide**. Within a tier, bindings are sorted by `rank` ascending (lower runs first; absent `rank` is treated as `100`). Rank is managed by the policies page (drag-and-drop) or `PUT /v1/owner/policies/order`.

The ordered layers are then merged:

- **Rules** from every layer are concatenated in order (most specific first), and the engine applies first-match semantics across the whole concatenated list. So a less-specific layer's rules still fire if nothing more specific matched.
- **The `default`** is resolved by walking layers most-specific first and taking the first one whose default is not `passthrough` (see [`default` values](#default-values)). This is the only thing that does *not* simply fall through — which is why `passthrough` exists.

### Example: owner-wide baseline with a per-agent override

```yaml
# Owner-wide (tier 3) — the org baseline
default: require_approval
rules:
  - id: deny_payouts
    effect: deny
    action: payment.payout
```

```yaml
# Agent-specific (tier 1) — inherits the baseline default, adds an allowance
default: passthrough
rules:
  - id: allow_reads
    effect: allow
    action: read.*
```

For this agent: `read.*` is allowed, `payment.payout` is denied (owner-wide rule still fires), and anything else falls through the agent layer's `passthrough` to the owner-wide `require_approval`. If the agent layer used `default: allow` instead, unmatched actions would be allowed — overriding the baseline.

## Rule Fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique rule identifier |
| `effect` | yes | `allow` or `deny` |
| `action` | yes | Action pattern to match |
| `description` | no | Human-readable description |
| `when` | no | Expression that must evaluate to true |
| `constraints` | no | Shortcut constraint checks |
| `requirements` | no | Assurance level requirements |
| `obligations` | no | Obligations to attach if rule matches |
| `proof` | no | Proof token configuration |

## Action Matching

| Pattern | Matches |
|---|---|
| `purchase` | Exact match: only `purchase` |
| `government.*` | Prefix wildcard: `government.submit_document`, `government.query`, etc. |
| `*` | Matches all action types |

## Expression Language

The `when` field uses a composable expression language:

### Logical operators

```yaml
when:
  all:
    - { match: { path: "$.payload.amount_minor", op: gt, value: 10000 } }
    - { match: { path: "$.payload.currency", op: eq, value: "USD" } }
```

```yaml
when:
  any:
    - { match: { path: "$.payload.category", op: eq, value: "healthcare" } }
    - { match: { path: "$.payload.category", op: eq, value: "dental" } }
```

```yaml
when:
  not:
    match: { path: "$.payload.category", op: eq, value: "hairdresser" }
```

### Match operators

| Operator | Description |
|---|---|
| `eq` | Equal |
| `neq` | Not equal |
| `in` | Value is in array |
| `nin` | Value is not in array |
| `lt` | Less than (numbers) |
| `lte` | Less than or equal |
| `gt` | Greater than (numbers) |
| `gte` | Greater than or equal |
| `regex` | Regex match (strings) |
| `exists` | Path exists and is not null |

### Path syntax

Paths start with `$.` and support dot access and array indexes:

- `$.payload.amount_minor`
- `$.payload.items[0].sku`
- `$.relying_party.domain`

## Constraints (Shortcuts)

Constraints provide shorthand for common checks:

```yaml
constraints:
  amount_max: 50000        # $.payload.amount_minor <= 50000
  amount_min: 1000         # $.payload.amount_minor >= 1000
  currency: ["USD", "EUR"] # $.payload.currency in list
  merchant_domain: ["amazon.com"]
  allowed_domains: ["gmail.com", "outlook.com"]
  blocked_domains: ["spam.example"]
```

**Resolution order for domain fields:**
- `merchant_domain` checks `$.payload.merchant_domain`, falls back to `$.relying_party.domain`
- `allowed_domains`/`blocked_domains` check `$.payload.domain`, falls back to `$.relying_party.domain`

## Requirements

```yaml
requirements:
  min_assurance_level: SUBSTANTIAL  # LOW, SUBSTANTIAL, or HIGH
```

If the action's assurance level (from `$.payload.assurance_level`, default `LOW`) doesn't meet the requirement, a `STEP_UP_AUTH` obligation is added.

## Obligations

```yaml
obligations:
  - type: HUMAN_APPROVAL
    params:
      reason: "Large purchase requires approval"
  - type: COUNTERPARTY_ATTESTATION
```

Types: `HUMAN_APPROVAL`, `STEP_UP_AUTH`, `DEPOSIT`, `COUNTERPARTY_ATTESTATION`

**Decision mapping (blocking precedence):**
1. `HUMAN_APPROVAL` → `REQUIRE_APPROVAL`
2. `STEP_UP_AUTH` → `REQUIRE_STEP_UP`
3. `DEPOSIT` → `REQUIRE_DEPOSIT`
4. `COUNTERPARTY_ATTESTATION` → `ALLOW` (non-blocking, included in response)

## Proof Configuration

```yaml
proof:
  required: true     # Force proof issuance on ALLOW
  ttl_seconds: 300   # Custom TTL (capped by config max)
```

Proof is also issued when `relying_party.trust_profile` is `HIGH` or `REGULATED`.

## Full Examples

### Example 1: Simple purchase policy

```yaml
version: 1
default: deny
rules:
  - id: allow_small_purchase
    effect: allow
    action: purchase
    constraints:
      amount_max: 50000
    proof:
      required: true

  - id: large_purchase_approval
    effect: allow
    action: purchase
    obligations:
      - type: HUMAN_APPROVAL
        params:
          reason: "Purchase exceeds limit"
```

### Example 2: Healthcare with step-up

```yaml
version: 1
default: deny
rules:
  - id: hairdresser_allow
    effect: allow
    action: appointment.book
    when:
      match:
        path: "$.payload.category"
        op: eq
        value: "hairdresser"

  - id: healthcare_stepup
    effect: allow
    action: appointment.book
    when:
      match:
        path: "$.payload.category"
        op: eq
        value: "healthcare"
    requirements:
      min_assurance_level: SUBSTANTIAL
```

### Example 3: Government with regulated trust

```yaml
version: 1
default: deny
rules:
  - id: gov_submit
    effect: allow
    action: "government.*"
    requirements:
      min_assurance_level: HIGH
    proof:
      required: true
      ttl_seconds: 60
```

### Example 4: Communication domain allowlist

```yaml
version: 1
default: deny
rules:
  - id: comm_allowed
    effect: allow
    action: "communication.*"
    constraints:
      allowed_domains: ["gmail.com", "outlook.com", "company.com"]

  - id: comm_deny_all
    effect: deny
    action: "communication.*"
    description: "Deny all other communication domains"
```
