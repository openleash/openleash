# openleash Wizard

Run the wizard with:

```bash
npx openleash wizard
```

## Wizard Steps

### Step 1: Owner Selection/Creation

**Prompt:** "Create new owner or use existing?"

If creating new:
- **Prompt:** Owner type (HUMAN or ORG)
- **Prompt:** Display name

**Files written:**
- `./data/owners/<uuid>.md` — Owner markdown file with YAML frontmatter
- `./data/state.md` — Updated with new owner entry
- `./data/audit.log.jsonl` — OWNER_CREATED event appended

### Step 2: Agent Registration

**Prompt:** "Generate a new agent keypair or import an existing public key?"

If generating:
- **Prompt:** Agent ID
- Generates Ed25519 keypair
- Prints private key base64 once (not stored by openleash)

If importing:
- **Prompt:** Agent ID
- **Prompt:** Public key base64 (SPKI DER format)

**Files written:**
- `./data/agents/<uuid>.md` — Agent markdown file with YAML frontmatter
- `./data/state.md` — Updated with new agent entry
- `./data/audit.log.jsonl` — AGENT_REGISTERED event appended

### Step 3: Policy Profile

**Prompt:** Choose profile: CONSERVATIVE / BALANCED / AUTONOMOUS / CUSTOM

#### CONSERVATIVE
- Allow small purchases <= 10,000 minor units
- Require approval above 10,000
- Deny government submissions
- Deny communication to non-allowlisted domains

Additional prompts (up to 3):
- Adjust max purchase amount

#### BALANCED
- Allow small purchases <= 50,000
- Require approval above 50,000
- Allow hairdresser booking
- Require step-up for healthcare/government

Additional prompts (up to 3):
- Adjust max purchase amount
- Allowed communication domains

#### AUTONOMOUS
- Allow purchases <= 200,000
- Require approval above 200,000
- Allow hairdresser booking
- Allow healthcare with step-up
- Allow government with step-up

Additional prompts (up to 3):
- Adjust max purchase amount
- Allowed communication domains

#### CUSTOM
Up to 12 prompts covering:
- Max purchase amount
- Allow hairdresser booking
- Allow healthcare appointments
- Require step-up for healthcare
- Allow government submissions
- Require step-up for government
- Allowed communication domains

### Step 4: Admin Access Mode

**Prompt:** Choose admin mode: localhost_or_token / localhost / token

If token mode selected and no token exists:
- Generates secure random token
- Writes token to `config.yaml`

**Files written:**
- `config.yaml` — Updated with admin mode and token

### Step 5: Policy Generation

No prompts. Uses templates and profile variables to generate a combined policy YAML.

**Files written:**
- `./data/policies/<uuid>.yaml` — Generated policy
- `./data/state.md` — Updated with policy entry and binding
- `./data/audit.log.jsonl` — POLICY_UPSERTED event appended

### Step 6: Demo Runs

No prompts. Runs 3 authorization scenarios using the core engine (not HTTP):

1. Small purchase (5,000 minor units)
2. Large purchase (500,000 minor units)
3. Communication to unknown domain

Prints decision result, matched rule, obligations, and proof status for each.

### Step 7: agent.env Snippet

No prompts. Prints ready-to-copy environment variables:

```
OPENLEASH_URL=http://127.0.0.1:8787
OPENLEASH_AGENT_ID=<agent-id>
OPENLEASH_AGENT_PRIVATE_KEY_B64=<key>  (only if generated)
OPENLEASH_ADMIN_TOKEN=<token>           (only if token exists)
```
