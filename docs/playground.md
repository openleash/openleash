# openleash Playground

The playground lets you test policy evaluation without running the HTTP server or setting up agents.

## List Scenarios

```bash
npx openleash playground list
```

Available scenarios:
- `small_purchase_allowed` — Purchase $50 USD from amazon.com
- `large_purchase_requires_approval` — Purchase $5,000 USD from amazon.com
- `hairdresser_booking_allowed` — Book a hairdresser appointment
- `doctor_booking_requires_stepup` — Book a healthcare appointment (requires step-up)
- `government_submit_requires_high` — Submit a government document (requires high assurance)
- `communication_new_domain_denied` — Send communication to unknown domain

## Run a Scenario

```bash
npx openleash playground run <scenarioName> [--policy <file>] [--policy-id <id>]
```

Options:
- `--policy <file>` — Use a specific policy YAML file
- `--policy-id <id>` — Use a policy from state by ID
- If neither specified, uses the most recent policy from state

## Output Format

```
=== Playground: small_purchase_allowed ===

Action Hash:     <sha256 hex>
Matched Rule:    purchase_small_allow
Decision:        ALLOW
Reason:          Allowed by rule "purchase_small_allow"
Obligations:     []
Proof Token:     (none)
Proof Required:  yes

Evaluation Trace:
  Rule: purchase_small_allow
    pattern_match:     YES
    when_match:        YES
    constraints_match: YES
    final_match:       YES
  Rule: purchase_large_approval
    pattern_match:     YES
    when_match:        YES
    constraints_match: NO
    final_match:       NO
  Rule: communication_deny
    pattern_match:     NO
    when_match:        N/A
    constraints_match: N/A
    final_match:       NO
```

## Interpreting the Trace

Each rule in the policy is evaluated and reported:

| Field | Meaning |
|---|---|
| `pattern_match` | Does the action type match the rule's action pattern? |
| `when_match` | Does the `when` expression evaluate to true? (N/A if pattern didn't match) |
| `constraints_match` | Do constraint shortcuts pass? (N/A if pattern or when didn't match) |
| `final_match` | Is this the matching rule? (first rule where all checks pass) |

The first rule with `final_match: YES` determines the decision. If no rule matches, the policy default is used.

## HTTP Playground

You can also use the HTTP endpoint:

```bash
curl -X POST http://127.0.0.1:8787/v1/playground/run \
  -H 'Content-Type: application/json' \
  -d '{
    "policy_yaml": "version: 1\ndefault: deny\nrules:\n  - id: test\n    effect: allow\n    action: \"*\"",
    "action": { ... }
  }'
```
