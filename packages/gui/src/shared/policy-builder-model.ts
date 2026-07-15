/**
 * Pure model logic for the visual policy builder — no DOM, no CSS.
 *
 * Everything the builder does to a parsed Policy object lives here so it can
 * be unit-tested: `when` expression-tree manipulation, scalar/list value
 * parsing for match conditions, obligation-list rebuilding (preserving
 * params, duplicates and unknown types), and model validation.
 *
 * The DOM wiring in `policy-builder.ts` (client-only) consumes this module.
 */

// ─── Policy model types (mirror @openleash/core, kept local so the client
// bundle doesn't pull in the core package) ──────────────────────────────

export type MatchOp =
    | "eq"
    | "neq"
    | "in"
    | "nin"
    | "lt"
    | "lte"
    | "gt"
    | "gte"
    | "regex"
    | "exists";

export interface ExprMatch {
    path: string;
    op: MatchOp;
    value?: unknown;
}

export type PolicyExpr =
    | { all: PolicyExpr[] }
    | { any: PolicyExpr[] }
    | { not: PolicyExpr }
    | { match: ExprMatch };

export interface PolicyObligation {
    type: string;
    params?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface PolicyProof {
    required?: boolean;
    ttl_seconds?: number;
    [key: string]: unknown;
}

export interface PolicyRule {
    id?: string;
    effect?: "allow" | "deny";
    action?: string;
    description?: string;
    when?: PolicyExpr;
    constraints?: Record<string, unknown>;
    requirements?: Record<string, unknown>;
    obligations?: PolicyObligation[];
    proof?: PolicyProof;
    [key: string]: unknown;
}

export interface PolicyModel {
    version?: number;
    default?: string;
    rules?: PolicyRule[];
    [key: string]: unknown;
}

// ─── Match operator metadata ────────────────────────────────────────

export type ValueKind = "none" | "scalar" | "list" | "regex";

export const MATCH_OPS: Array<{ value: MatchOp; label: string; valueKind: ValueKind }> = [
    { value: "eq", label: "equals", valueKind: "scalar" },
    { value: "neq", label: "not equals", valueKind: "scalar" },
    { value: "in", label: "is one of", valueKind: "list" },
    { value: "nin", label: "is not one of", valueKind: "list" },
    { value: "lt", label: "<", valueKind: "scalar" },
    { value: "lte", label: "≤", valueKind: "scalar" },
    { value: "gt", label: ">", valueKind: "scalar" },
    { value: "gte", label: "≥", valueKind: "scalar" },
    { value: "regex", label: "matches regex", valueKind: "regex" },
    { value: "exists", label: "exists", valueKind: "none" },
];

export function opValueKind(op: string): ValueKind {
    return MATCH_OPS.find((o) => o.value === op)?.valueKind ?? "scalar";
}

// ─── Scalar / list value parsing ────────────────────────────────────
// Match values are arbitrary JSON. The form edits them as text, so map
// text → typed values the way YAML would: numbers, booleans and null
// become literals; wrap in double quotes to force a string.

export function parseScalar(raw: string): unknown {
    const s = raw.trim();
    if (s === "") return "";
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    return s;
}

export function scalarToString(v: unknown): string {
    if (v === undefined) return "";
    if (v === null) return "null";
    if (typeof v === "string") {
        // Quote strings that would otherwise parse as a literal.
        const reparsed = parseScalar(v);
        return typeof reparsed === "string" && reparsed === v ? v : `"${v}"`;
    }
    return String(v);
}

export function parseList(raw: string): unknown[] {
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "")
        .map(parseScalar);
}

export function listToString(v: unknown): string {
    if (!Array.isArray(v)) return "";
    return v.map(scalarToString).join(", ");
}

// ─── Expression tree helpers ────────────────────────────────────────
// A node is addressed by a number[] path from the root: the index into an
// `all`/`any` group's children; a `not` has its single child at index 0.

export type ExprKind = "all" | "any" | "not" | "match" | "unknown";

export function exprKind(e: unknown): ExprKind {
    if (e === null || typeof e !== "object") return "unknown";
    const o = e as Record<string, unknown>;
    if (Array.isArray(o.all)) return "all";
    if (Array.isArray(o.any)) return "any";
    if (o.not !== undefined) return "not";
    if (o.match !== undefined && typeof o.match === "object") return "match";
    return "unknown";
}

export function exprChildren(e: PolicyExpr): PolicyExpr[] | null {
    const kind = exprKind(e);
    if (kind === "all") return (e as { all: PolicyExpr[] }).all;
    if (kind === "any") return (e as { any: PolicyExpr[] }).any;
    if (kind === "not") return [(e as { not: PolicyExpr }).not];
    return null;
}

export function getExprAt(root: PolicyExpr, path: number[]): PolicyExpr | undefined {
    let node: PolicyExpr | undefined = root;
    for (const idx of path) {
        if (!node) return undefined;
        const children = exprChildren(node);
        node = children?.[idx];
    }
    return node;
}

/** Replace the node at `path`. Returns the (possibly new) root. */
export function replaceExprAt(root: PolicyExpr, path: number[], node: PolicyExpr): PolicyExpr {
    if (path.length === 0) return node;
    const parent = getExprAt(root, path.slice(0, -1));
    const idx = path[path.length - 1];
    if (!parent) return root;
    const kind = exprKind(parent);
    if (kind === "all" || kind === "any") {
        const children = exprChildren(parent)!;
        if (idx >= 0 && idx < children.length) children[idx] = node;
    } else if (kind === "not") {
        (parent as { not: PolicyExpr }).not = node;
    }
    return root;
}

/**
 * Remove the node at `path`. Returns the new root, or undefined when the
 * removal leaves no expression at all. Groups left with zero children are
 * removed too (recursively); a `not` whose child is removed is removed itself.
 */
export function removeExprAt(root: PolicyExpr, path: number[]): PolicyExpr | undefined {
    if (path.length === 0) return undefined;
    const parentPath = path.slice(0, -1);
    const parent = getExprAt(root, parentPath);
    if (!parent) return root;
    const kind = exprKind(parent);
    if (kind === "not") {
        // Removing the only child removes the NOT itself.
        return removeExprAt(root, parentPath);
    }
    if (kind === "all" || kind === "any") {
        const children = exprChildren(parent)!;
        children.splice(path[path.length - 1], 1);
        if (children.length === 0) return removeExprAt(root, parentPath);
    }
    return root;
}

/** Append a child to the group at `path` (no-op if it isn't a group). */
export function addExprChild(root: PolicyExpr, path: number[], child: PolicyExpr): PolicyExpr {
    const node = getExprAt(root, path);
    if (!node) return root;
    const kind = exprKind(node);
    if (kind === "all" || kind === "any") {
        exprChildren(node)!.push(child);
    }
    return root;
}

export function defaultMatch(): PolicyExpr {
    return { match: { path: "$.", op: "eq", value: "" } };
}

/** Swap an `all` group to `any` or vice versa, keeping children. */
export function swapGroupKind(node: PolicyExpr, to: "all" | "any"): PolicyExpr {
    const children = exprChildren(node);
    const kind = exprKind(node);
    if (!children || (kind !== "all" && kind !== "any") || kind === to) return node;
    const rec = node as Record<string, unknown>;
    rec[to] = children;
    delete rec[kind];
    return node;
}

// ─── Obligation rebuilding ──────────────────────────────────────────

export interface ObligationParamsPatch {
    /** New params for the FIRST occurrence of the type; undefined = clear. */
    params: Record<string, unknown> | undefined;
}

/**
 * Rebuild a rule's obligation list from the checkbox state without losing
 * anything the checkboxes can't express:
 *
 * - Obligations whose type is not in `knownTypes` are preserved verbatim.
 * - Duplicate obligations of a checked type are all kept.
 * - Unchecking a known type moves its entries into `stash` so re-checking
 *   restores them (params included) instead of recreating a bare `{type}`.
 * - `paramsPatch` (from the params editors) applies to the first occurrence
 *   of each checked type.
 *
 * `stash` is mutated in place and owned by the caller (one per rule).
 */
export function rebuildObligations(
    existing: PolicyObligation[] | undefined,
    checkedTypes: string[],
    knownTypes: string[],
    stash: Map<string, PolicyObligation[]>,
    paramsPatch?: Map<string, ObligationParamsPatch>,
): PolicyObligation[] {
    const current = Array.isArray(existing) ? existing.filter((o) => o && typeof o === "object") : [];
    const checked = new Set(checkedTypes);
    const known = new Set(knownTypes);

    const result: PolicyObligation[] = [];
    for (const ob of current) {
        const isKnown = known.has(ob.type);
        if (!isKnown || checked.has(ob.type)) {
            result.push(ob);
        } else {
            // Known type, now unchecked — stash for a later re-check.
            const bucket = stash.get(ob.type) ?? [];
            bucket.push(ob);
            stash.set(ob.type, bucket);
        }
    }

    // Checked types with no surviving entry: restore from stash or create.
    for (const t of checkedTypes) {
        if (!result.some((o) => o.type === t)) {
            const stashed = stash.get(t);
            if (stashed && stashed.length > 0) {
                result.push(...stashed);
                stash.delete(t);
            } else {
                result.push({ type: t });
            }
        }
    }

    // Apply params edits to the first occurrence of each type.
    if (paramsPatch) {
        for (const [type, patch] of paramsPatch) {
            const first = result.find((o) => o.type === type);
            if (!first) continue;
            if (patch.params === undefined) delete first.params;
            else first.params = patch.params;
        }
    }

    return result;
}

// ─── Validation ─────────────────────────────────────────────────────

export const POLICY_DEFAULTS = ["allow", "deny", "passthrough", "require_approval"];

function validateExpr(expr: unknown, where: string, errors: string[]): void {
    const kind = exprKind(expr);
    if (kind === "unknown") {
        errors.push(`${where}: condition has an unrecognized shape (expected all/any/not/match).`);
        return;
    }
    if (kind === "match") {
        const m = (expr as { match: ExprMatch }).match;
        if (typeof m.path !== "string" || !m.path.startsWith("$.") || m.path.length <= 2) {
            errors.push(`${where}: condition path must start with "$." and name a field (e.g. $.payload.amount_minor).`);
        }
        const opMeta = MATCH_OPS.find((o) => o.value === m.op);
        if (!opMeta) {
            errors.push(`${where}: unknown condition operator "${String(m.op)}".`);
            return;
        }
        if (opMeta.valueKind === "list") {
            if (!Array.isArray(m.value) || m.value.length === 0) {
                errors.push(`${where}: "${opMeta.label}" needs at least one value.`);
            }
        } else if (opMeta.valueKind === "regex") {
            if (typeof m.value !== "string" || m.value === "") {
                errors.push(`${where}: regex condition needs a pattern.`);
            } else {
                try {
                    new RegExp(m.value);
                } catch {
                    errors.push(`${where}: "${m.value}" is not a valid regular expression.`);
                }
            }
        } else if (opMeta.valueKind === "scalar") {
            if (m.value === undefined || m.value === "") {
                errors.push(`${where}: condition with "${opMeta.label}" needs a value.`);
            }
        }
        return;
    }
    const children = exprChildren(expr as PolicyExpr)!;
    if (kind !== "not" && children.length === 0) {
        errors.push(`${where}: empty ${kind.toUpperCase()} group — add a condition or remove it.`);
    }
    children.forEach((c) => validateExpr(c, where, errors));
}

/** Human-readable problems that would make the server reject the policy. */
export function validatePolicyModel(model: PolicyModel): string[] {
    const errors: string[] = [];
    if (typeof model.default !== "string" || !POLICY_DEFAULTS.includes(model.default)) {
        errors.push(`Default must be one of: ${POLICY_DEFAULTS.join(", ")}.`);
    }
    const rules = Array.isArray(model.rules) ? model.rules : [];
    rules.forEach((rule, i) => {
        const where = `Rule ${i + 1}`;
        if (!rule || typeof rule !== "object") {
            errors.push(`${where}: not a valid rule object.`);
            return;
        }
        if (!rule.id || typeof rule.id !== "string") errors.push(`${where}: rule ID is required.`);
        if (rule.effect !== "allow" && rule.effect !== "deny") {
            errors.push(`${where}: effect must be allow or deny.`);
        }
        if (!rule.action || typeof rule.action !== "string") {
            errors.push(`${where}: action is required (exact like payment.send, prefix like payment.*, or *).`);
        }
        if (rule.when !== undefined) validateExpr(rule.when, where, errors);
        if (rule.proof?.ttl_seconds !== undefined && (typeof rule.proof.ttl_seconds !== "number" || rule.proof.ttl_seconds <= 0)) {
            errors.push(`${where}: proof TTL must be a positive number of seconds.`);
        }
    });
    return errors;
}

// ─── Human-readable expression summary (used in card headers) ───────

export function summarizeExpr(expr: PolicyExpr): string {
    const kind = exprKind(expr);
    if (kind === "match") {
        const m = (expr as { match: ExprMatch }).match;
        const opMeta = MATCH_OPS.find((o) => o.value === m.op);
        const valueKind = opMeta?.valueKind ?? "scalar";
        const v =
            valueKind === "none"
                ? ""
                : valueKind === "list"
                    ? ` [${listToString(m.value)}]`
                    : ` ${scalarToString(m.value)}`;
        return `${m.path} ${opMeta?.label ?? m.op}${v}`;
    }
    if (kind === "not") return `NOT (${summarizeExpr((expr as { not: PolicyExpr }).not)})`;
    if (kind === "all" || kind === "any") {
        const children = exprChildren(expr)!;
        return children.map(summarizeExpr).join(kind === "all" ? " AND " : " OR ");
    }
    return "(unrecognized)";
}
