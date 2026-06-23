/**
 * Client-side logic for the owner output-transformations page.
 */
import "./style.css";
import { olToast, olConfirm, olApiError } from "../../shared/common";

interface OwnerTransformationsPageData {
    orgId: string | null;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerTransformationsPageData;
    }
}

const { orgId } = window.__PAGE_DATA__;

// Org-scoped transformations are not supported in this PoC; warn rather than
// silently hitting the user-scoped endpoints under an org URL.
if (orgId) {
    olToast("Transformations are personal-scope only in this demo.", "error");
}

const baseUrl = "/v1/owner/transformations";

function ruleFromFields(typeEl: string, fields: HTMLElement): Record<string, unknown> | string {
    if (typeEl === "cap_output_length") {
        const chars = (fields.querySelector('[data-field="max_characters"]') as HTMLInputElement | null)?.value.trim();
        const lines = (fields.querySelector('[data-field="max_lines"]') as HTMLInputElement | null)?.value.trim();
        const rule: Record<string, unknown> = { type: "cap_output_length" };
        if (chars) rule.max_characters = Number(chars);
        if (lines) rule.max_lines = Number(lines);
        if (!chars && !lines) return "Set max_characters and/or max_lines";
        return rule;
    }
    const from = (fields.querySelector('[data-field="from_pattern"]') as HTMLInputElement | null)?.value ?? "";
    const to = (fields.querySelector('[data-field="to_pattern"]') as HTMLInputElement | null)?.value ?? "";
    if (!from) return "from_pattern is required";
    return { type: "regex_replace", from_pattern: from, to_pattern: to };
}

async function saveTransformation(id: string, row: HTMLElement) {
    const type = row.dataset.type!;
    const fields = row.querySelector<HTMLElement>(".otr-fields");
    if (!fields) return;
    const rule = ruleFromFields(type, fields);
    if (typeof rule === "string") { olToast(rule, "error"); return; }

    const res = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule }),
    });
    if (!res.ok) {
        olToast(olApiError(await res.json().catch(() => ({})), "Failed to save"), "error");
        return;
    }
    olToast("Saved", "success");
}

async function setEnabled(id: string, enabled: boolean) {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
        olToast(olApiError(await res.json().catch(() => ({})), "Failed to update"), "error");
        return;
    }
    olToast(enabled ? "Enabled" : "Disabled", "success");
}

async function deleteTransformation(id: string) {
    if (!(await olConfirm("Delete this transformation?", "Delete Transformation"))) return;
    const res = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
        olToast(olApiError(await res.json().catch(() => ({})), "Failed to delete"), "error");
        return;
    }
    window.location.reload();
}

async function createTransformation() {
    const type = (document.getElementById("otr-new-type") as HTMLSelectElement).value;
    const name = (document.getElementById("otr-new-name") as HTMLInputElement).value.trim();

    let rule: Record<string, unknown> | string;
    if (type === "cap_output_length") {
        const chars = (document.getElementById("otr-new-max-characters") as HTMLInputElement).value.trim();
        const lines = (document.getElementById("otr-new-max-lines") as HTMLInputElement).value.trim();
        if (!chars && !lines) { olToast("Set max_characters and/or max_lines", "error"); return; }
        rule = { type: "cap_output_length" };
        if (chars) (rule as Record<string, unknown>).max_characters = Number(chars);
        if (lines) (rule as Record<string, unknown>).max_lines = Number(lines);
    } else {
        const from = (document.getElementById("otr-new-from") as HTMLInputElement).value;
        const to = (document.getElementById("otr-new-to") as HTMLInputElement).value;
        if (!from) { olToast("from_pattern is required", "error"); return; }
        rule = { type: "regex_replace", from_pattern: from, to_pattern: to };
    }

    const body: Record<string, unknown> = { rule };
    if (name) body.name = name;

    const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        olToast(olApiError(await res.json().catch(() => ({})), "Failed to create"), "error");
        return;
    }
    window.location.reload();
}

// ─── Wiring ─────────────────────────────────────────────────────────

// Toggle the create form's field group based on the selected type.
const typeSelect = document.getElementById("otr-new-type") as HTMLSelectElement | null;
function syncCreateFields() {
    const isCap = typeSelect?.value === "cap_output_length";
    document.getElementById("otr-new-fields-cap")?.classList.toggle("otr-hidden", !isCap);
    document.getElementById("otr-new-fields-regex")?.classList.toggle("otr-hidden", isCap);
}
typeSelect?.addEventListener("change", syncCreateFields);
syncCreateFields();

document.getElementById("otr-create-btn")?.addEventListener("click", createTransformation);

document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const save = target.closest<HTMLElement>("[data-save-transformation]");
    if (save) {
        const row = save.closest<HTMLElement>(".otr-row");
        if (row) saveTransformation(save.dataset.saveTransformation!, row);
        return;
    }
    const del = target.closest<HTMLElement>("[data-delete-transformation]");
    if (del) { deleteTransformation(del.dataset.deleteTransformation!); return; }
});

document.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("otr-enabled")) {
        const cb = target as HTMLInputElement;
        setEnabled(cb.dataset.transformationId!, cb.checked);
    }
});
