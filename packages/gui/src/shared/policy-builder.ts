/**
 * Shared client-side policy builder.
 *
 * Mounts onto the markup produced by `renderPolicyBuilderShell()` and turns the
 * raw-YAML authoring experience into a visual form, while keeping a YAML tab in
 * sync both ways. Every schema field is editable visually: rule basics (id,
 * effect, action, description), `when` condition trees (all/any/not groups and
 * all match operators including regex), constraints, requirements, obligations
 * with params, and proof settings. Unknown top-level keys ride along untouched
 * so round-trips are lossless.
 *
 * Pure model logic (expression-tree ops, value parsing, obligation rebuild,
 * validation) lives in `policy-builder-model.ts` — keep DOM-free logic there.
 *
 * Used by the create and edit policy pages.
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { olToast } from "./common";
import {
    MATCH_OPS,
    addExprChild,
    defaultMatch,
    exprChildren,
    exprKind,
    getExprAt,
    listToString,
    opValueKind,
    parseList,
    parseScalar,
    rebuildObligations,
    removeExprAt,
    scalarToString,
    swapGroupKind,
    validatePolicyModel,
} from "./policy-builder-model";
import type {
    ExprMatch,
    ObligationParamsPatch,
    PolicyExpr,
    PolicyModel,
    PolicyObligation,
    PolicyRule,
} from "./policy-builder-model";
import "./styles/policy-builder.css";

const DEFAULT_OPTIONS: Array<{ value: string; title: string; desc: string }> = [
    {
        value: "deny",
        title: "Deny",
        desc: "Block anything no rule explicitly allows. Safest, fail-closed default.",
    },
    {
        value: "require_approval",
        title: "Require approval",
        desc: "Ask a human to approve anything no rule covers (emits a HUMAN_APPROVAL obligation).",
    },
    {
        value: "allow",
        title: "Allow",
        desc: "Permit anything no rule explicitly denies. Most permissive.",
    },
    {
        value: "passthrough",
        title: "Pass through",
        desc: "Abstain and defer to the next, less-specific policy layer. Denies if there is none. (Advanced — for layered org policies.)",
    },
];

const OBLIGATION_TYPES = [
    "HUMAN_APPROVAL",
    "STEP_UP_AUTH",
    "DEPOSIT",
    "COUNTERPARTY_ATTESTATION",
];

const ASSURANCE_LEVELS = ["LOW", "SUBSTANTIAL", "HIGH"];

const ARRAY_CONSTRAINTS = [
    { key: "currency", label: "Allowed currencies" },
    { key: "merchant_domain", label: "Merchant domains" },
    { key: "allowed_domains", label: "Allowed domains" },
    { key: "blocked_domains", label: "Blocked domains" },
];

// ─── Helpers ────────────────────────────────────────────────────────

function esc(s: unknown): string {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function csvToArray(v: string): string[] {
    return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function arrayToCsv(v: unknown): string {
    return Array.isArray(v) ? v.join(", ") : "";
}

function num(v: string): number | undefined {
    if (v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function $(id: string): HTMLElement | null {
    return document.getElementById(id);
}

function parseExprPath(s: string | undefined): number[] {
    if (!s) return [];
    return s.split(".").map(Number);
}

// ─── Builder ────────────────────────────────────────────────────────

export interface PolicyBuilder {
    /** Current policy as a YAML string (from whichever mode is active). */
    getYaml(): string;
    /**
     * Problems that would make the server reject the policy (empty when OK).
     * Call before saving; shows nothing itself.
     */
    validate(): string[];
}

export function mountPolicyBuilder(): PolicyBuilder {
    const root = $("policy-builder");
    const yamlArea = $("policy-yaml") as HTMLTextAreaElement | null;
    const visualPanel = $("pb-visual");
    const yamlPanel = $("pb-yaml-panel");
    const defaultContainer = $("pb-default");
    const rulesContainer = $("pb-rules");
    if (!root || !yamlArea || !visualPanel || !yamlPanel || !defaultContainer || !rulesContainer) {
        // Builder markup not present — nothing to mount.
        return { getYaml: () => yamlArea?.value ?? "", validate: () => [] };
    }

    let mode: "visual" | "yaml" = "visual";
    let defaultValue = "deny";
    let rules: PolicyRule[] = [];
    let extraKeys: PolicyModel = {}; // top-level keys we don't manage (kept verbatim)
    // Obligations removed by unchecking live here so re-checking restores
    // them (params included) instead of recreating a bare `{ type }`.
    const obligationStash = new WeakMap<PolicyRule, Map<string, PolicyObligation[]>>();
    // Problems found while reading the form (bad JSON params, non-numeric
    // amounts). Refreshed by every syncFormToModel(); surfaced by validate().
    let syncProblems: string[] = [];

    function stashFor(rule: PolicyRule): Map<string, PolicyObligation[]> {
        let m = obligationStash.get(rule);
        if (!m) {
            m = new Map();
            obligationStash.set(rule, m);
        }
        return m;
    }

    // ── Parse initial YAML from the textarea into the model ──
    function loadFromYaml(yaml: string): boolean {
        let parsed: unknown;
        try {
            parsed = yaml.trim() === "" ? {} : parseYaml(yaml);
        } catch (e) {
            olToast("YAML is invalid: " + (e as Error).message, "error");
            return false;
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            olToast("Policy must be a YAML object with a default and rules.", "error");
            return false;
        }
        const model = parsed as PolicyModel;
        defaultValue = typeof model.default === "string" ? model.default : "deny";
        rules = Array.isArray(model.rules) ? (model.rules as PolicyRule[]) : [];
        // Stash everything except the keys the form owns.
        extraKeys = {};
        for (const [k, v] of Object.entries(model)) {
            if (k !== "default" && k !== "rules") extraKeys[k] = v;
        }
        if (extraKeys.version === undefined) extraKeys.version = 1;
        return true;
    }

    // ── Build a plain Policy object from the current model ──
    function buildPolicyObject(): PolicyModel {
        const out: PolicyModel = { ...extraKeys };
        out.default = defaultValue;
        out.rules = rules.map(cleanRule);
        // Keep a tidy key order: version, default, rules first.
        const ordered: PolicyModel = {};
        if (out.version !== undefined) ordered.version = out.version;
        ordered.default = out.default;
        ordered.rules = out.rules;
        for (const [k, v] of Object.entries(out)) {
            if (k !== "version" && k !== "default" && k !== "rules") ordered[k] = v;
        }
        return ordered;
    }

    function cleanRule(rule: PolicyRule): PolicyRule {
        const r: PolicyRule = { ...rule };
        if (!r.description) delete r.description;
        if (r.constraints && Object.keys(r.constraints).length === 0) delete r.constraints;
        if (r.requirements && Object.keys(r.requirements).length === 0) delete r.requirements;
        if (r.obligations && r.obligations.length === 0) delete r.obligations;
        if (r.proof && Object.keys(r.proof).length === 0) delete r.proof;
        return r;
    }

    // ── Render the default-decision radio cards ──
    function renderDefault() {
        defaultContainer!.innerHTML = DEFAULT_OPTIONS.map(
            (o) => `
        <label class="pb-default-card${o.value === defaultValue ? " pb-default-card-active" : ""}">
          <input type="radio" name="pb-default" value="${esc(o.value)}"${o.value === defaultValue ? " checked" : ""}>
          <span class="pb-default-title">${esc(o.title)}</span>
          <span class="pb-default-desc">${esc(o.desc)}</span>
        </label>`,
        ).join("");
    }

    // ── `when` condition tree ──

    function matchRowHtml(m: ExprMatch, pathStr: string): string {
        const kind = opValueKind(m.op);
        const ops = MATCH_OPS.map(
            (o) => `<option value="${o.value}"${o.value === m.op ? " selected" : ""}>${esc(o.label)}</option>`,
        ).join("");
        let valueInput = "";
        if (kind === "list") {
            valueInput = `<input type="text" class="form-input pb-expr-value" value="${esc(listToString(m.value))}" placeholder="comma, separated, values">`;
        } else if (kind === "regex") {
            const v = typeof m.value === "string" ? m.value : "";
            valueInput = `<input type="text" class="form-input pb-expr-value pb-expr-regex" value="${esc(v)}" placeholder="^pattern.*$" spellcheck="false">`;
        } else if (kind === "scalar") {
            valueInput = `<input type="text" class="form-input pb-expr-value" value="${esc(scalarToString(m.value))}" placeholder="value">`;
        }
        return `
        <div class="pb-expr-match" data-expr-path="${esc(pathStr)}">
          <input type="text" class="form-input pb-expr-path" value="${esc(m.path)}" placeholder="$.payload.field" spellcheck="false">
          <select class="form-select pb-expr-op">${ops}</select>
          ${valueInput}
          <button type="button" class="pb-expr-remove" data-expr-remove="${esc(pathStr)}" title="Remove condition"><span class="material-symbols-outlined">close</span></button>
        </div>`;
    }

    function exprHtml(expr: PolicyExpr, path: number[]): string {
        const pathStr = path.join(".");
        const kind = exprKind(expr);
        if (kind === "match") {
            return matchRowHtml((expr as { match: ExprMatch }).match, pathStr);
        }
        if (kind === "not") {
            const child = (expr as { not: PolicyExpr }).not;
            return `
          <div class="pb-expr-group pb-expr-not" data-expr-path="${esc(pathStr)}">
            <div class="pb-expr-group-head">
              <span class="pb-expr-not-label">NOT</span>
              <button type="button" class="pb-expr-remove" data-expr-remove="${esc(pathStr)}" title="Remove NOT group"><span class="material-symbols-outlined">close</span></button>
            </div>
            ${exprHtml(child, [...path, 0])}
          </div>`;
        }
        if (kind === "all" || kind === "any") {
            const children = exprChildren(expr)!;
            return `
          <div class="pb-expr-group" data-expr-path="${esc(pathStr)}">
            <div class="pb-expr-group-head">
              <select class="form-select pb-expr-kind">
                <option value="all"${kind === "all" ? " selected" : ""}>ALL of (AND)</option>
                <option value="any"${kind === "any" ? " selected" : ""}>ANY of (OR)</option>
              </select>
              <button type="button" class="pb-expr-remove" data-expr-remove="${esc(pathStr)}" title="Remove group"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="pb-expr-children">
              ${children.map((c, i) => exprHtml(c, [...path, i])).join("")}
            </div>
            <div class="pb-expr-actions">
              <button type="button" class="btn btn-secondary pb-btn-sm" data-expr-add-match="${esc(pathStr)}">+ condition</button>
              <button type="button" class="btn btn-secondary pb-btn-sm" data-expr-add-group="${esc(pathStr)}">+ group</button>
              <button type="button" class="btn btn-secondary pb-btn-sm" data-expr-add-not="${esc(pathStr)}">+ NOT</button>
            </div>
          </div>`;
        }
        // Unrecognized shape — keep it visible and untouched.
        return `
        <div class="pb-expr-unknown" data-expr-path="${esc(pathStr)}">
          <span class="badge badge-blue pb-badge-sm">unrecognized condition — edit in the YAML tab</span>
          <pre class="pb-expr-raw">${esc(JSON.stringify(expr))}</pre>
        </div>`;
    }

    function whenEditorHtml(rule: PolicyRule): string {
        if (rule.when === undefined) {
            return `
          <div class="pb-when">
            <div class="pb-when-empty">
              <button type="button" class="btn btn-secondary pb-btn-sm" data-when-add>+ Add condition</button>
              <span class="pb-when-hint">No condition — the rule applies whenever the action matches.</span>
            </div>
          </div>`;
        }
        const rootKind = exprKind(rule.when);
        const wrapButton =
            rootKind === "match" || rootKind === "not"
                ? `<div class="pb-expr-actions"><button type="button" class="btn btn-secondary pb-btn-sm" data-when-wrap-and>+ AND another condition</button></div>`
                : "";
        return `
        <div class="pb-when">
          ${exprHtml(rule.when, [])}
          ${wrapButton}
        </div>`;
    }

    // ── Obligations (checkbox + params per type, extras preserved) ──

    function obligationsHtml(rule: PolicyRule): string {
        const obligations = Array.isArray(rule.obligations) ? rule.obligations : [];
        const blocks = OBLIGATION_TYPES.map((t) => {
            const ofType = obligations.filter((o) => o && o.type === t);
            const checked = ofType.length > 0;
            const params = ofType[0]?.params;
            const paramsValue = params === undefined ? "" : JSON.stringify(params, null, 2);
            const dupNote =
                ofType.length > 1
                    ? `<span class="pb-obligation-note">×${ofType.length} — extra occurrences preserved; edit in YAML</span>`
                    : "";
            return `
            <div class="pb-obligation-block">
              <label class="pb-obligation">
                <input type="checkbox" class="pb-rule-obligation" value="${esc(t)}"${checked ? " checked" : ""}>
                <span>${esc(t)}</span>
                ${dupNote}
              </label>
              ${checked ? `<textarea class="form-input pb-obligation-params" data-obligation-type="${esc(t)}" rows="2" placeholder='Optional JSON params, e.g. { "amount": 100 }' spellcheck="false">${esc(paramsValue)}</textarea>` : ""}
            </div>`;
        }).join("");
        const unknown = obligations
            .filter((o) => o && !OBLIGATION_TYPES.includes(o.type))
            .map(
                (o) =>
                    `<span class="badge badge-blue pb-badge-sm" title="Unknown obligation type — preserved as-is; edit in the YAML tab">custom: ${esc(o.type)}</span>`,
            )
            .join(" ");
        return blocks + (unknown ? `<div class="pb-obligation-unknown">${unknown}</div>` : "");
    }

    // ── Render one rule card ──
    function ruleCardHtml(rule: PolicyRule, i: number): string {
        const c = rule.constraints ?? {};
        const req = rule.requirements ?? {};
        const obligations = Array.isArray(rule.obligations) ? rule.obligations : [];
        const proof = rule.proof ?? {};
        const sectionOpen =
            Object.keys(c).length ||
            Object.keys(req).length ||
            obligations.length ||
            rule.when !== undefined ||
            rule.proof !== undefined;

        const arrayFields = ARRAY_CONSTRAINTS.map(
            (f) => `
          <div class="pb-field">
            <label class="pb-field-label">${esc(f.label)}</label>
            <input type="text" class="form-input pb-rule-${esc(f.key)}" value="${esc(arrayToCsv(c[f.key]))}" placeholder="comma,separated">
          </div>`,
        ).join("");

        return `
      <div class="pb-rule card" data-rule-index="${i}">
        <div class="pb-rule-head">
          <span class="pb-rule-num">Rule ${i + 1}</span>
          <button type="button" class="btn btn-secondary pb-btn-danger-outline pb-remove-rule" data-remove-rule="${i}">Remove</button>
        </div>
        <div class="pb-rule-grid">
          <div class="pb-field">
            <label class="pb-field-label">Rule ID</label>
            <input type="text" class="form-input pb-rule-id" value="${esc(rule.id)}" placeholder="e.g. allow_read">
          </div>
          <div class="pb-field">
            <label class="pb-field-label">Effect</label>
            <select class="form-select pb-rule-effect">
              <option value="allow"${rule.effect !== "deny" ? " selected" : ""}>Allow</option>
              <option value="deny"${rule.effect === "deny" ? " selected" : ""}>Deny</option>
            </select>
          </div>
          <div class="pb-field">
            <label class="pb-field-label">Action</label>
            <input type="text" class="form-input pb-rule-action" value="${esc(rule.action)}" placeholder="e.g. payment.send or read.*">
            <span class="pb-field-hint">Exact (payment.send), prefix (payment.*), or * for everything.</span>
          </div>
          <div class="pb-field pb-field-wide">
            <label class="pb-field-label">Description</label>
            <input type="text" class="form-input pb-rule-description" value="${esc(rule.description)}" placeholder="What this rule does (optional)">
          </div>
        </div>

        <details class="pb-rule-section"${sectionOpen ? " open" : ""}>
          <summary>Conditions &amp; obligations</summary>
          <div class="pb-field pb-field-wide">
            <label class="pb-field-label">Condition (when) — matched against the action's JSON</label>
            ${whenEditorHtml(rule)}
          </div>
          <div class="pb-rule-grid">
            <div class="pb-field">
              <label class="pb-field-label">Min amount</label>
              <input type="number" step="any" class="form-input pb-rule-amount_min" value="${esc(c.amount_min)}" placeholder="any">
            </div>
            <div class="pb-field">
              <label class="pb-field-label">Max amount</label>
              <input type="number" step="any" class="form-input pb-rule-amount_max" value="${esc(c.amount_max)}" placeholder="any">
            </div>
            ${arrayFields}
            <div class="pb-field">
              <label class="pb-field-label">Min assurance level</label>
              <select class="form-select pb-rule-assurance">
                <option value="">Any</option>
                ${ASSURANCE_LEVELS.map((l) => `<option value="${l}"${req.min_assurance_level === l ? " selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
            <div class="pb-field">
              <label class="pb-field-label">Credential scheme</label>
              <input type="text" class="form-input pb-rule-credential_scheme" value="${esc(req.credential_scheme)}" placeholder="optional">
            </div>
            <div class="pb-field">
              <label class="pb-field-label">Proof</label>
              <label class="pb-obligation">
                <input type="checkbox" class="pb-rule-proof-required"${proof.required === true ? " checked" : ""}>
                <span>Require proof token</span>
              </label>
            </div>
            <div class="pb-field">
              <label class="pb-field-label">Proof TTL (seconds)</label>
              <input type="number" min="1" step="1" class="form-input pb-rule-proof-ttl" value="${esc(proof.ttl_seconds)}" placeholder="default">
            </div>
          </div>
          <div class="pb-field">
            <label class="pb-field-label">Obligations (required before the action proceeds)</label>
            <div class="pb-obligations">${obligationsHtml(rule)}</div>
          </div>
        </details>
      </div>`;
    }

    function renderRules() {
        if (rules.length === 0) {
            rulesContainer!.innerHTML = `<p class="pb-empty text-muted">No rules yet. Everything falls through to the default decision above. Add a rule to allow or deny specific actions.</p>`;
            return;
        }
        rulesContainer!.innerHTML = rules.map((r, i) => ruleCardHtml(r, i)).join("");
    }

    /** Re-render a single rule card, preserving its details-open state. */
    function rerenderCard(i: number) {
        const card = rulesContainer!.querySelector<HTMLElement>(`.pb-rule[data-rule-index="${i}"]`);
        const rule = rules[i];
        if (!card || !rule) {
            renderRules();
            return;
        }
        const wasOpen = card.querySelector<HTMLDetailsElement>("details")?.open;
        card.outerHTML = ruleCardHtml(rule, i);
        if (wasOpen !== undefined) {
            const fresh = rulesContainer!.querySelector<HTMLDetailsElement>(
                `.pb-rule[data-rule-index="${i}"] details`,
            );
            if (fresh) fresh.open = wasOpen;
        }
    }

    // ── Read the visual form back into the model (in place) ──
    function syncFormToModel() {
        syncProblems = [];
        const checkedDefault = defaultContainer!.querySelector<HTMLInputElement>(
            "input[name='pb-default']:checked",
        );
        if (checkedDefault) defaultValue = checkedDefault.value;

        const cards = rulesContainer!.querySelectorAll<HTMLElement>(".pb-rule");
        cards.forEach((card) => {
            const i = Number(card.dataset.ruleIndex);
            const rule = rules[i];
            if (!rule) return;
            const where = `Rule ${i + 1}`;

            const getEl = (cls: string) =>
                card.querySelector<HTMLInputElement | HTMLSelectElement>("." + cls);
            const get = (cls: string) => (getEl(cls)?.value ?? "").trim();

            rule.id = get("pb-rule-id");
            rule.effect = get("pb-rule-effect") === "deny" ? "deny" : "allow";
            rule.action = get("pb-rule-action");
            const desc = get("pb-rule-description");
            if (desc) rule.description = desc;
            else delete rule.description;

            // `when` is maintained directly by the condition-tree event
            // handlers — nothing to read back here.

            // Constraints — merge into existing object so unknown keys survive.
            const constraints: Record<string, unknown> = { ...(rule.constraints ?? {}) };
            const setOrDel = (key: string, val: unknown) => {
                if (val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
                    delete constraints[key];
                } else {
                    constraints[key] = val;
                }
            };
            // Number inputs report "" for garbage like "1,000" — detect via
            // validity.badInput and keep the previous value instead of
            // silently dropping the constraint (which would loosen the policy).
            const readAmount = (cls: string, key: string, label: string) => {
                const el = getEl(cls) as HTMLInputElement | null;
                if (el?.validity?.badInput) {
                    el.classList.add("pb-input-error");
                    syncProblems.push(`${where}: ${label} is not a number — previous value kept.`);
                    return;
                }
                el?.classList.remove("pb-input-error");
                setOrDel(key, num(el?.value ?? ""));
            };
            readAmount("pb-rule-amount_min", "amount_min", "Min amount");
            readAmount("pb-rule-amount_max", "amount_max", "Max amount");
            for (const f of ARRAY_CONSTRAINTS) {
                setOrDel(f.key, csvToArray(get("pb-rule-" + f.key)));
            }
            if (Object.keys(constraints).length) rule.constraints = constraints;
            else delete rule.constraints;

            // Requirements — likewise merged.
            const requirements: Record<string, unknown> = { ...(rule.requirements ?? {}) };
            const assurance = get("pb-rule-assurance");
            if (assurance) requirements.min_assurance_level = assurance;
            else delete requirements.min_assurance_level;
            const scheme = get("pb-rule-credential_scheme");
            if (scheme) requirements.credential_scheme = scheme;
            else delete requirements.credential_scheme;
            if (Object.keys(requirements).length) rule.requirements = requirements;
            else delete rule.requirements;

            // Proof — build from existing so unknown keys survive. An explicit
            // `required: false` normalizes to the key being absent (engine
            // semantics are identical).
            const proof: Record<string, unknown> = { ...(rule.proof ?? {}) };
            const proofRequired = (getEl("pb-rule-proof-required") as HTMLInputElement | null)?.checked;
            if (proofRequired) proof.required = true;
            else delete proof.required;
            const ttlEl = getEl("pb-rule-proof-ttl") as HTMLInputElement | null;
            if (ttlEl?.validity?.badInput) {
                ttlEl.classList.add("pb-input-error");
                syncProblems.push(`${where}: Proof TTL is not a number — previous value kept.`);
            } else {
                ttlEl?.classList.remove("pb-input-error");
                const ttl = num(ttlEl?.value ?? "");
                if (ttl !== undefined) proof.ttl_seconds = ttl;
                else delete proof.ttl_seconds;
            }
            if (Object.keys(proof).length) rule.proof = proof;
            else delete rule.proof;

            // Obligations — rebuild via the model helper: unknown types and
            // duplicates are preserved, unchecked entries are stashed so a
            // re-check restores their params.
            const checked = Array.from(
                card.querySelectorAll<HTMLInputElement>(".pb-rule-obligation:checked"),
            ).map((el) => el.value);
            const paramsPatch = new Map<string, ObligationParamsPatch>();
            card.querySelectorAll<HTMLTextAreaElement>(".pb-obligation-params").forEach((ta) => {
                const type = ta.dataset.obligationType ?? "";
                if (!checked.includes(type)) return;
                const raw = ta.value.trim();
                if (raw === "") {
                    paramsPatch.set(type, { params: undefined });
                    ta.classList.remove("pb-input-error");
                    return;
                }
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                        throw new Error("params must be a JSON object");
                    }
                    paramsPatch.set(type, { params: parsed as Record<string, unknown> });
                    ta.classList.remove("pb-input-error");
                } catch {
                    ta.classList.add("pb-input-error");
                    syncProblems.push(`${where}: ${type} params is not a valid JSON object — previous value kept.`);
                }
            });
            const rebuilt = rebuildObligations(
                rule.obligations,
                checked,
                OBLIGATION_TYPES,
                stashFor(rule),
                paramsPatch,
            );
            if (rebuilt.length) rule.obligations = rebuilt;
            else delete rule.obligations;
        });
    }

    // ── Condition-tree helpers (DOM ↔ model) ──

    function ruleIndexOf(el: Element): number {
        return Number(el.closest<HTMLElement>(".pb-rule")?.dataset.ruleIndex ?? -1);
    }

    function matchAt(rule: PolicyRule, pathStr: string | undefined): ExprMatch | null {
        if (!rule.when) return null;
        const node = getExprAt(rule.when, parseExprPath(pathStr));
        if (!node || exprKind(node) !== "match") return null;
        return (node as { match: ExprMatch }).match;
    }

    /** Convert a match's stored value when its operator changes kind. */
    function convertValueForOp(m: ExprMatch, newOp: string): void {
        const kind = opValueKind(newOp);
        const v = m.value;
        if (kind === "none") {
            delete m.value;
        } else if (kind === "list") {
            m.value = Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v];
        } else if (kind === "regex") {
            m.value = typeof v === "string" ? v : "";
        } else {
            m.value = Array.isArray(v) ? (v[0] ?? "") : v === undefined ? "" : v;
        }
    }

    // ── Mode switching ──
    function showVisual() {
        mode = "visual";
        renderDefault();
        renderRules();
        visualPanel!.classList.remove("hidden");
        yamlPanel!.classList.add("hidden");
        setActiveModeButton();
    }

    function showYaml() {
        mode = "yaml";
        visualPanel!.classList.add("hidden");
        yamlPanel!.classList.remove("hidden");
        setActiveModeButton();
    }

    function setActiveModeButton() {
        root!.querySelectorAll<HTMLElement>("[data-pb-mode]").forEach((btn) => {
            btn.classList.toggle("pb-mode-active", btn.dataset.pbMode === mode);
        });
    }

    // ── Event wiring ──
    root.querySelectorAll<HTMLElement>("[data-pb-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.pbMode;
            if (target === mode) return;
            if (target === "yaml") {
                syncFormToModel();
                yamlArea.value = stringifyYaml(buildPolicyObject());
                showYaml();
            } else {
                // Switching to visual — re-parse whatever is in the textarea.
                if (!loadFromYaml(yamlArea.value)) return; // stay in YAML on error
                showVisual();
            }
        });
    });

    defaultContainer.addEventListener("change", (e) => {
        const t = e.target as HTMLInputElement;
        if (t.name !== "pb-default") return;
        defaultValue = t.value;
        renderDefault(); // re-render to move the active highlight
    });

    // Live updates for condition inputs — write straight into the model so
    // nothing is lost when another action triggers a re-render.
    rulesContainer.addEventListener("input", (e) => {
        const t = e.target as HTMLInputElement;
        const row = t.closest<HTMLElement>("[data-expr-path]");
        if (!row) return;
        const rule = rules[ruleIndexOf(t)];
        if (!rule) return;
        const m = matchAt(rule, row.dataset.exprPath);
        if (!m) return;
        if (t.classList.contains("pb-expr-path")) {
            m.path = t.value.trim();
        } else if (t.classList.contains("pb-expr-value")) {
            const kind = opValueKind(m.op);
            if (kind === "list") m.value = parseList(t.value);
            else if (kind === "regex") m.value = t.value;
            else if (kind === "scalar") m.value = parseScalar(t.value);
        }
    });

    rulesContainer.addEventListener("change", (e) => {
        const t = e.target as HTMLInputElement | HTMLSelectElement;
        const i = ruleIndexOf(t);
        const rule = rules[i];
        if (!rule) return;

        if (t.classList.contains("pb-expr-op")) {
            const row = t.closest<HTMLElement>("[data-expr-path]");
            const m = matchAt(rule, row?.dataset.exprPath);
            if (!m) return;
            syncFormToModel();
            m.op = t.value as ExprMatch["op"];
            convertValueForOp(m, t.value);
            rerenderCard(i); // the value input's kind may have changed
            return;
        }
        if (t.classList.contains("pb-expr-kind")) {
            const row = t.closest<HTMLElement>("[data-expr-path]");
            if (!rule.when) return;
            const node = getExprAt(rule.when, parseExprPath(row?.dataset.exprPath));
            if (!node) return;
            syncFormToModel();
            swapGroupKind(node, t.value as "all" | "any");
            rerenderCard(i);
            return;
        }
        if (t.classList.contains("pb-rule-obligation")) {
            // Sync (which stashes/restores obligations), then re-render so the
            // params editor appears/disappears with the checkbox.
            syncFormToModel();
            rerenderCard(i);
            return;
        }
    });

    rulesContainer.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;

        const remove = target.closest<HTMLElement>("[data-remove-rule]");
        if (remove) {
            syncFormToModel();
            rules.splice(Number(remove.dataset.removeRule), 1);
            renderRules();
            return;
        }

        const i = ruleIndexOf(target);
        const rule = rules[i];
        if (!rule) return;

        const whenAdd = target.closest<HTMLElement>("[data-when-add]");
        if (whenAdd) {
            syncFormToModel();
            rule.when = defaultMatch();
            rerenderCard(i);
            return;
        }
        const wrapAnd = target.closest<HTMLElement>("[data-when-wrap-and]");
        if (wrapAnd && rule.when) {
            syncFormToModel();
            rule.when = { all: [rule.when, defaultMatch()] };
            rerenderCard(i);
            return;
        }
        const exprRemove = target.closest<HTMLElement>("[data-expr-remove]");
        if (exprRemove && rule.when) {
            syncFormToModel();
            const newRoot = removeExprAt(rule.when, parseExprPath(exprRemove.dataset.exprRemove));
            if (newRoot === undefined) delete rule.when;
            else rule.when = newRoot;
            rerenderCard(i);
            return;
        }
        const addMatch = target.closest<HTMLElement>("[data-expr-add-match]");
        if (addMatch && rule.when) {
            syncFormToModel();
            addExprChild(rule.when, parseExprPath(addMatch.dataset.exprAddMatch), defaultMatch());
            rerenderCard(i);
            return;
        }
        const addGroup = target.closest<HTMLElement>("[data-expr-add-group]");
        if (addGroup && rule.when) {
            syncFormToModel();
            addExprChild(rule.when, parseExprPath(addGroup.dataset.exprAddGroup), {
                all: [defaultMatch()],
            });
            rerenderCard(i);
            return;
        }
        const addNot = target.closest<HTMLElement>("[data-expr-add-not]");
        if (addNot && rule.when) {
            syncFormToModel();
            addExprChild(rule.when, parseExprPath(addNot.dataset.exprAddNot), {
                not: defaultMatch(),
            });
            rerenderCard(i);
            return;
        }
    });

    $("pb-add-rule")?.addEventListener("click", () => {
        syncFormToModel();
        rules.push({ id: "", effect: "allow", action: "" });
        renderRules();
        // Focus the new rule's ID field.
        const last = rulesContainer.querySelector<HTMLElement>(".pb-rule:last-child .pb-rule-id");
        last?.focus();
    });

    // ── Initial mount: parse the textarea's starting YAML. ──
    if (!loadFromYaml(yamlArea.value)) {
        // Fall back to YAML mode so the user can fix it by hand.
        showYaml();
    } else {
        showVisual();
    }

    return {
        getYaml(): string {
            if (mode === "visual") {
                syncFormToModel();
                return stringifyYaml(buildPolicyObject());
            }
            return yamlArea.value;
        },
        validate(): string[] {
            if (mode === "visual") {
                syncFormToModel();
                return [...syncProblems, ...validatePolicyModel(buildPolicyObject())];
            }
            let parsed: unknown;
            try {
                parsed = parseYaml(yamlArea.value);
            } catch (e) {
                return ["YAML is invalid: " + (e as Error).message];
            }
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                return ["Policy must be a YAML object with a default and rules."];
            }
            return validatePolicyModel(parsed as PolicyModel);
        },
    };
}
