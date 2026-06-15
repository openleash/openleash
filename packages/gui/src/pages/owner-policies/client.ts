/**
 * Client-side logic for the owner policies page.
 */
import "./style.css";
import { olToast, olConfirm, olPrompt, ol2FA, olApiError, bindAccordionRows } from "../../shared/common";

interface OwnerPoliciesPageData {
    totpEnabled: boolean;
    /** When set, this page is rendered under an org scope and API calls must use the org-scoped URLs. */
    orgId: string | null;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerPoliciesPageData;
    }
}

const { totpEnabled, orgId } = window.__PAGE_DATA__;

const policyUrl = (id: string) =>
    orgId
        ? `/v1/owner/organizations/${encodeURIComponent(orgId)}/policies/${encodeURIComponent(id)}`
        : `/v1/owner/policies/${encodeURIComponent(id)}`;

const draftUrl = (id: string, action: string) =>
    orgId
        ? `/v1/owner/organizations/${encodeURIComponent(orgId)}/policy-drafts/${encodeURIComponent(id)}/${action}`
        : `/v1/owner/policy-drafts/${encodeURIComponent(id)}/${action}`;

async function deletePolicy(id: string) {
    if (!(await olConfirm("Are you sure you want to delete this policy?", "Delete Policy"))) return;

    async function doDelete(totpCode?: string): Promise<string | null> {
        const headers: Record<string, string> = {};
        const opts: RequestInit = { method: "DELETE", headers };
        if (totpCode) {
            headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify({ totp_code: totpCode });
        }
        const res = await fetch(policyUrl(id), opts);
        if (res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return olApiError(data, "Failed to delete policy");
    }

    if (totpEnabled) {
        const result = await ol2FA(doDelete);
        if (!result) return;
    } else {
        const err = await doDelete();
        if (err) { olToast(err, "error"); return; }
    }
    window.location.reload();
}

async function handleDraft(id: string, action: string) {
    const bodyObj: Record<string, unknown> = {};
    if (action === "deny") {
        const reason = await olPrompt("Reason for denial (optional):", "Enter reason...", "Deny Draft");
        if (reason === null) return;
        if (reason) bodyObj.reason = reason;
    }

    async function doDraft(totpCode?: string): Promise<string | null> {
        if (totpCode) bodyObj.totp_code = totpCode;
        try {
            const res = await fetch(draftUrl(id, action), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyObj),
            });
            if (res.ok) return null;
            const data = await res.json();
            return olApiError(data, "Failed");
        } catch {
            return "Network error";
        }
    }

    if (totpEnabled) {
        const result = await ol2FA(doDraft);
        if (!result) return;
    } else {
        const err = await doDraft();
        if (err) { olToast(err, "error"); return; }
    }
    window.location.reload();
}

// ─── Drag-and-drop reorder ──────────────────────────────────────────

type Tier = "agent" | "group" | "owner_wide";

const reorderUrl = () =>
    orgId
        ? `/v1/owner/organizations/${encodeURIComponent(orgId)}/policies/order`
        : `/v1/owner/policies/order`;

let dragRow: HTMLTableRowElement | null = null;
let dragTier: Tier | null = null;
let dragSnapshot: HTMLTableRowElement[] = [];

function getTierBody(tier: Tier): HTMLTableSectionElement | null {
    return document.querySelector<HTMLTableSectionElement>(`[data-tier-body="${tier}"]`);
}

function getPolicyRows(tier: Tier): HTMLTableRowElement[] {
    const body = getTierBody(tier);
    if (!body) return [];
    return Array.from(body.querySelectorAll<HTMLTableRowElement>("tr.opol-policy-row"));
}

function snapshotRows(rows: HTMLTableRowElement[]): HTMLTableRowElement[] {
    // Clone the live array; rows themselves are stable DOM nodes.
    return rows.slice();
}

function restoreSnapshot(tier: Tier, snapshot: HTMLTableRowElement[]) {
    const body = getTierBody(tier);
    if (!body) return;
    for (const row of snapshot) {
        body.appendChild(row);
    }
}

async function submitOrder(tier: Tier, rows: HTMLTableRowElement[]) {
    const ordered_policy_ids = rows.map((r) => r.dataset.policyId!).filter(Boolean);
    if (ordered_policy_ids.length === 0) return null;
    const res = await fetch(reorderUrl(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, ordered_policy_ids }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return olApiError(data, "Failed to reorder");
    }
    olToast("Order saved", "success");
    return null;
}

document.addEventListener("dragstart", (e) => {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLTableRowElement>("tr.opol-policy-row");
    if (!row) return;
    const tier = row.dataset.tier as Tier | undefined;
    if (!tier) return;
    dragRow = row;
    dragTier = tier;
    dragSnapshot = snapshotRows(getPolicyRows(tier));
    row.classList.add("opol-row-dragging");
    e.dataTransfer!.effectAllowed = "move";
    // Setting *some* data is required for Firefox to start the drag.
    e.dataTransfer!.setData("text/plain", row.dataset.policyId ?? "");
});

document.addEventListener("dragend", () => {
    if (dragRow) dragRow.classList.remove("opol-row-dragging");
    document
        .querySelectorAll(".opol-row-drop-target")
        .forEach((el) => el.classList.remove("opol-row-drop-target"));
    dragRow = null;
    dragTier = null;
    dragSnapshot = [];
});

document.addEventListener("dragover", (e) => {
    if (!dragRow || !dragTier) return;
    const target = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.opol-policy-row");
    if (!target || target.dataset.tier !== dragTier || target === dragRow) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    document
        .querySelectorAll(".opol-row-drop-target")
        .forEach((el) => el.classList.remove("opol-row-drop-target"));
    target.classList.add("opol-row-drop-target");
});

document.addEventListener("drop", async (e) => {
    if (!dragRow || !dragTier) return;
    const target = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.opol-policy-row");
    if (!target || target.dataset.tier !== dragTier || target === dragRow) return;
    e.preventDefault();

    // Move dragRow to just before `target`.
    const body = target.parentElement!;
    body.insertBefore(dragRow, target);

    const tier = dragTier;
    const newRows = getPolicyRows(tier);
    const snap = dragSnapshot;

    // Reset drag state so the dragend handler won't fight us on revert.
    dragRow.classList.remove("opol-row-dragging");
    target.classList.remove("opol-row-drop-target");
    dragRow = null;
    dragTier = null;
    dragSnapshot = [];

    const err = await submitOrder(tier, newRows);
    if (err) {
        restoreSnapshot(tier, snap);
        olToast(err, "error");
    }
});

// ─── Event bindings ─────────────────────────────────────────────────

// Accordion rows (draft toggles)
bindAccordionRows();

// Dynamic policy actions via event delegation
document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const del = target.closest<HTMLElement>("[data-delete-policy]");
    if (del) { deletePolicy(del.dataset.deletePolicy!); return; }
    const draft = target.closest<HTMLElement>("[data-handle-draft]");
    if (draft) {
        e.stopPropagation();
        handleDraft(draft.dataset.handleDraft!, draft.dataset.draftAction!);
        return;
    }
});
