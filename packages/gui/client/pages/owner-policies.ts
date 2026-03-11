/**
 * Client-side logic for the owner policies page.
 */
import { olToast, olConfirm, olPrompt, ol2FA, olApiError } from "../common";

interface OwnerPoliciesPageData {
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerPoliciesPageData;
    }
}

const { totpEnabled } = window.__PAGE_DATA__;
const token = sessionStorage.getItem("openleash_session");

function toggleEditor(policyId: string) {
    document.getElementById("editor-row-" + policyId)!.classList.toggle("hidden");
}

async function savePolicy(policyId: string) {
    const yaml = (document.getElementById("editor-yaml-" + policyId) as HTMLTextAreaElement).value;
    const name = (document.getElementById("editor-name-" + policyId) as HTMLInputElement).value;
    const desc = (document.getElementById("editor-desc-" + policyId) as HTMLInputElement).value;

    const res = await fetch("/v1/owner/policies/" + policyId, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ policy_yaml: yaml, name: name || null, description: desc || null }),
    });

    if (res.ok) {
        olToast("Policy saved", "success");
    } else {
        const data = await res.json();
        olToast(olApiError(data, "Failed to save policy"), "error");
    }
}

async function deletePolicy(id: string) {
    if (!(await olConfirm("Are you sure you want to delete this policy?", "Delete Policy"))) return;

    async function doDelete(totpCode?: string): Promise<string | null> {
        const headers: Record<string, string> = { Authorization: "Bearer " + token };
        const opts: RequestInit = { method: "DELETE", headers };
        if (totpCode) {
            headers["Content-Type"] = "application/json";
            opts.body = JSON.stringify({ totp_code: totpCode });
        }
        const res = await fetch("/v1/owner/policies/" + id, opts);
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
            const res = await fetch("/v1/owner/policy-drafts/" + id + "/" + action, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
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

// ─── Event bindings ─────────────────────────────────────────────────

// Accordion rows (draft toggles)
document.querySelectorAll<HTMLElement>(".accordion-row").forEach((row) => {
    row.addEventListener("click", () => {
        const detail = row.nextElementSibling as HTMLElement;
        if (detail?.classList.contains("accordion-detail")) {
            detail.classList.toggle("open");
            row.classList.toggle("expanded");
        }
    });
});

// Dynamic policy actions via event delegation
document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-toggle-editor]");
    if (btn) { toggleEditor(btn.dataset.toggleEditor!); return; }
    const del = target.closest<HTMLElement>("[data-delete-policy]");
    if (del) { deletePolicy(del.dataset.deletePolicy!); return; }
    const save = target.closest<HTMLElement>("[data-save-policy]");
    if (save) { savePolicy(save.dataset.savePolicy!); return; }
    const draft = target.closest<HTMLElement>("[data-handle-draft]");
    if (draft) {
        e.stopPropagation();
        handleDraft(draft.dataset.handleDraft!, draft.dataset.draftAction!);
        return;
    }
});
