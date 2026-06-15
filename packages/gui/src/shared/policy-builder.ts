/**
 * Shared client-side policy builder.
 *
 * Mounts onto the markup produced by `renderPolicyBuilderShell()` and turns the
 * raw-YAML authoring experience into a visual form, while keeping a YAML tab in
 * sync both ways. The common rule fields (effect, action, constraints,
 * requirements, obligations) are editable visually; advanced fields a rule may
 * carry (`when`, `proof`, or anything else) ride along untouched so switching
 * between the two modes is lossless.
 *
 * Used by the create and edit policy pages.
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { olToast } from "./common";
import "./styles/policy-builder.css";

// ─── Model ──────────────────────────────────────────────────────────
// The model is just a plain parsed Policy object. The form edits known
// fields in place; unknown keys are preserved.

interface PolicyRule {
    id?: string;
    effect?: "allow" | "deny";
    action?: string;
    description?: string;
    constraints?: Record<string, unknown>;
    requirements?: Record<string, unknown>;
    obligations?: Array<{ type: string; params?: Record<string, unknown> }>;
    // when / proof / future fields live here untouched.
    [key: string]: unknown;
}

interface PolicyModel {
    version?: number;
    default?: string;
    rules?: PolicyRule[];
    [key: string]: unknown;
}

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

// ─── Builder ────────────────────────────────────────────────────────

export interface PolicyBuilder {
    /** Current policy as a YAML string (from whichever mode is active). */
    getYaml(): string;
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
        return { getYaml: () => yamlArea?.value ?? "" };
    }

    let mode: "visual" | "yaml" = "visual";
    let defaultValue = "deny";
    let rules: PolicyRule[] = [];
    let extraKeys: PolicyModel = {}; // top-level keys we don't manage (kept verbatim)

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

    // ── Render one rule card ──
    function ruleCardHtml(rule: PolicyRule, i: number): string {
        const c = rule.constraints ?? {};
        const req = rule.requirements ?? {};
        const obligations = Array.isArray(rule.obligations) ? rule.obligations : [];
        const hasObligation = (t: string) => obligations.some((o) => o && o.type === t);
        const hasAdvanced = rule.when !== undefined || rule.proof !== undefined;

        const arrayFields = ARRAY_CONSTRAINTS.map(
            (f) => `
          <div class="pb-field">
            <label class="pb-field-label">${esc(f.label)}</label>
            <input type="text" class="form-input pb-rule-${esc(f.key)}" value="${esc(arrayToCsv(c[f.key]))}" placeholder="comma,separated">
          </div>`,
        ).join("");

        const obligationChecks = OBLIGATION_TYPES.map(
            (t) => `
            <label class="pb-obligation">
              <input type="checkbox" class="pb-rule-obligation" value="${esc(t)}"${hasObligation(t) ? " checked" : ""}>
              <span>${esc(t)}</span>
            </label>`,
        ).join("");

        return `
      <div class="pb-rule card" data-rule-index="${i}">
        <div class="pb-rule-head">
          <span class="pb-rule-num">Rule ${i + 1}</span>
          ${hasAdvanced ? `<span class="badge badge-blue pb-badge-sm" title="This rule uses 'when' or 'proof' — edit those in the YAML tab">advanced fields</span>` : ""}
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
          </div>
          <div class="pb-field pb-field-wide">
            <label class="pb-field-label">Description</label>
            <input type="text" class="form-input pb-rule-description" value="${esc(rule.description)}" placeholder="What this rule does (optional)">
          </div>
        </div>

        <details class="pb-rule-section"${(Object.keys(c).length || Object.keys(req).length || obligations.length) ? " open" : ""}>
          <summary>Conditions &amp; obligations</summary>
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
          </div>
          <div class="pb-field">
            <label class="pb-field-label">Obligations (required before the action proceeds)</label>
            <div class="pb-obligations">${obligationChecks}</div>
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

    // ── Read the visual form back into the model (in place) ──
    function syncFormToModel() {
        const checkedDefault = defaultContainer!.querySelector<HTMLInputElement>(
            "input[name='pb-default']:checked",
        );
        if (checkedDefault) defaultValue = checkedDefault.value;

        const cards = rulesContainer!.querySelectorAll<HTMLElement>(".pb-rule");
        cards.forEach((card) => {
            const i = Number(card.dataset.ruleIndex);
            const rule = rules[i];
            if (!rule) return;

            const get = (cls: string) =>
                (card.querySelector<HTMLInputElement | HTMLSelectElement>("." + cls)?.value ?? "").trim();

            rule.id = get("pb-rule-id");
            rule.effect = get("pb-rule-effect") === "deny" ? "deny" : "allow";
            rule.action = get("pb-rule-action");
            const desc = get("pb-rule-description");
            if (desc) rule.description = desc;
            else delete rule.description;

            // Constraints — merge into existing object so unknown keys survive.
            const constraints: Record<string, unknown> = { ...(rule.constraints ?? {}) };
            const setOrDel = (key: string, val: unknown) => {
                if (val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
                    delete constraints[key];
                } else {
                    constraints[key] = val;
                }
            };
            setOrDel("amount_min", num(get("pb-rule-amount_min")));
            setOrDel("amount_max", num(get("pb-rule-amount_max")));
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

            // Obligations — preserve existing params for kept types.
            const checked = Array.from(
                card.querySelectorAll<HTMLInputElement>(".pb-rule-obligation:checked"),
            ).map((el) => el.value);
            if (checked.length) {
                const existing = Array.isArray(rule.obligations) ? rule.obligations : [];
                rule.obligations = checked.map(
                    (t) => existing.find((o) => o && o.type === t) ?? { type: t },
                );
            } else {
                delete rule.obligations;
            }
        });
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

    rulesContainer.addEventListener("click", (e) => {
        const remove = (e.target as HTMLElement).closest<HTMLElement>("[data-remove-rule]");
        if (remove) {
            syncFormToModel();
            rules.splice(Number(remove.dataset.removeRule), 1);
            renderRules();
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
    };
}
