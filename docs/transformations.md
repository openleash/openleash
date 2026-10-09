# Output transformations

Transformations run after a tool returns, before its output reaches the agent.
OpenLeash manages the rules; a compatible runtime enforces them locally. An
ALLOW decision does not mean that output transformations have already run.

## Managing rules

Use **Transformations** in your personal or organization workspace. Owners and
organization admins can create, edit, enable, disable, reorder and
delete rules. Organization viewers have read access. The Admin tab is a
read-only view across owners, matching the policy administration model.
Agent details show the effective ordered chain.

Use **Create Transformation** or a row's **Edit** button to open the editor.
Drag rows by their handles to change the execution order; focused handles also
support the arrow keys. The info bubbles explain execution and draft review.

Each rule has a name, description, enabled flag, failure policy and a target:
all agents of the owner, one agent, or one organization policy group. Agent and
group targets must belong to that owner. Rules never cross owner boundaries.
Provisioners can also bind an existing owner rule to an additional owner agent.
Removing that binding does not suppress other matching targets.

All enabled, approved matching rules run in ascending rank order, with UUID as
the tie breaker. Agent and group rules do not override owner-wide rules. A rule
matching several ways runs once. Reordering requires every active record in the
owner workspace, including disabled records, exactly once. At most 500 active
records are allowed per owner.

Edits increment a revision. Send the current `revision` with updates to reject
stale writes with 409. Deletion and draft resolution require TOTP or an unused
backup code if enabled. A server requiring TOTP requires setup first. Deleting
an owner removes its transformations; deleting an agent removes rules targeting
it and its proposals. Remove or retarget rules before deleting a referenced
group or transferring a directly targeted agent to another owner.

## Protocol v1

Signed `GET /v1/agent/transformations` returns `protocol_version: 1`, a flattened
`transformations` array, and an opaque `report_token`. Sign GET using body `{}`.
Apply the returned order without re-sorting or caching it beyond the tool call.

- `cap_output_length`: at least one positive `max_characters` or `max_lines`,
  each at most 1,048,576. Characters are Unicode code points; lines are delimited
  by LF, retaining an included line's trailing LF. CR alone is not a line break.
  Caps constrain both their place in the chain and the final output, so a later
  replacement cannot grow output beyond an earlier cap. Warnings are metadata,
  never appended to output.
- `regex_replace`: a non-empty pattern up to 2,048 characters and literal
  replacement up to 4,096 characters. Replacement is global, case-sensitive,
  with no multiline mode or backreference substitution. `$1` and `\1` remain
  literal text in replacements. Dot matches any code point except LF; `^` and
  `$` anchor the absolute start and end. `\d` and `\w` use ASCII; `\s` means
  space, tab, LF, CR, form feed and vertical tab.

The portable regex subset supports literals, character classes, quantifiers,
alternation, capturing groups and noncapturing `(?:...)` groups. Lookaround,
backreferences, named groups, inline flags, Unicode properties/escapes, word
boundaries, `\S`, possessive quantifiers and patterns matching empty input are
rejected. Use the preview API to verify a rule against synthetic examples.

The LibreMock runtime limits input and intermediate output to 1,048,576 code
points. Each regex runs in a separate process with a one-second default deadline
(configurable up to five seconds); the whole chain has a five-second execution
budget. The server preview uses a worker with a 250 ms deadline and accepts up
to 65,536 UTF-16 code units of sample text. Preview is one rule, not the entire
chain, and may time out sooner than the runtime. Neither preview nor result
reporting writes sample/tool output to the audit log.

`failure_policy` defaults to `block`: a malformed rule, timeout or execution
failure prevents output reaching the agent. `continue` explicitly permits
skipping that failed rule. Fetch failures block by default in the LibreMock
runtime; its `transformation_failure_policy: continue` is an explicit opt-out.
Callers must honor the hook's `blocked` result and stop the success continuation.
Only strings are supported; adapt structured output before calling the hook.
Shadow mode fetches rules under its existing short deadline but does not apply
or report execution of them.

## Proposals and provisioning

Agents may POST a rule, name/description and justification to
`/v1/agent/transformation-drafts`. Proposals target that agent only and do not
execute until owner approval. At most 20 pending proposals per agent are
allowed. GET the same path to see status and denial reasons. Owners review them
in Transformations or via `/v1/owner[/organizations/{orgId}]/transformation-drafts`;
POST `/{id}/approve` or `/{id}/deny`. Approval appends an enabled, blocking rule
to the chain. A resolved proposal cannot be resolved twice.

Provisioner tokens can GET `/v1/provisioner/transformations` and POST/DELETE
`/v1/provisioner/agents/{agentId}/transformations/{id}`. These operations are
restricted to their owner; pending or denied drafts cannot be bound.

## Audit and SDKs

Configuration creation, edits, ordering, deletion, bindings and proposal
resolution create audit events. Creation, edits and approval include the rule
configuration and revision for historical inspection. Ordering records the
ordered IDs; every reorder also increments the affected revisions.

After execution, POST `/v1/agent/transformation-results` with the fetched
`report_token`, a UUID `tool_call_id`, optional UUID `action_id`, outcome and one
result for every fetched ID/revision. Results contain only status, character
counts and bounded reason codes. Tokens expire after 10 minutes and are bound
to the agent and the fetched revisions, so an intervening rule edit does not
invalidate the snapshot. Extra output fields and forged/foreign snapshots are
rejected. Repeated reports may create repeated audit events; correlate by
`tool_call_id`.

`TRANSFORMATION_EXECUTION_REPORTED` is explicitly **runtime-reported evidence**.
OpenLeash cannot prove that an external runtime applied a rule or reported every
tool call. A report failure does not restore unredacted output; the hook exposes
`report_error` for the caller to surface and monitor.

TypeScript exports `getTransformations`, `reportTransformationResults`,
`createTransformationDraft`, `listTransformationDrafts`. Python uses snake_case
names; Go uses the corresponding exported CamelCase names. These SDK helpers
handle signed transport; only the runtime kit implements enforcement.
See the [OpenAPI reference](../openapi/openapi.yaml) for complete request shapes.

## Upgrading

Existing records default to revision 1, blocking failures, and no group target;
no data rewrite is required. Existing valid cap and regex records remain
readable. Malformed legacy records fail closed during enforcement until edited.
Replacement text is now literal and caps no longer append warning text. Review
patterns relying on language-specific regex behavior before enabling them.
Upgrade the server, SDK and runtime together to get execution reporting and the
new failure semantics. Older runtimes can fetch the flat rule list but do not
provide the new enforcement and audit guarantees.
