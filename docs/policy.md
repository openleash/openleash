# openleash Policy Reference

## Schema

Policies are YAML files with this structure:

```yaml
version: 1          # always 1
default: deny       # "allow" or "deny" — applied when no rule matches
rules:              # ordered list of rules
  - id: rule_name
    effect: allow   # "allow" or "deny"
    action: purchase
    # ... additional fields
```

Rules are evaluated in order. The first matching rule determines the decision. If no rule matches, the `default` is used.

Full JSON Schema: [docs/policy.schema.json](./policy.schema.json)

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
