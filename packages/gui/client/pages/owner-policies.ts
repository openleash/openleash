/**
 * Client-side logic for the owner policies page.
 */

interface OwnerPoliciesPageData {
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerPoliciesPageData;
        toggleEditor: (policyId: string) => void;
        toggleDraft: (id: string) => void;
        savePolicy: (policyId: string) => Promise<void>;
        deletePolicy: (id: string) => Promise<void>;
        handleDraft: (id: string, action: string) => Promise<void>;
    }
}

const { totpEnabled } = window.__PAGE_DATA__;
const token = sessionStorage.getItem("openleash_session");

window.toggleEditor = function (policyId: string) {
    document.getElementById("editor-row-" + policyId)!.classList.toggle("hidden");
};

window.toggleDraft = function (id: string) {
    const detail = document.getElementById("detail-" + id)!;
    const row = detail.previousElementSibling as HTMLElement;
    detail.classList.toggle("open");
    row.classList.toggle("expanded");
};

window.savePolicy = async function (policyId: string) {
    const yaml = (document.getElementById("editor-yaml-" + policyId) as HTMLTextAreaElement).value;
    const name = (document.getElementById("editor-name-" + policyId) as HTMLInputElement).value;
    const desc = (document.getElementById("editor-desc-" + policyId) as HTMLInputElement).value;

    const res = await fetch("/v1/owner/policies/" + policyId, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ policy_yaml: yaml, name: name || null, description: desc || null }),
    });

    if (res.ok) {
        window.olToast("Policy saved", "success");
    } else {
        const data = await res.json();
        window.olToast(window.olApiError(data, "Failed to save policy"), "error");
    }
};

window.deletePolicy = async function (id: string) {
    if (!(await window.olConfirm("Are you sure you want to delete this policy?", "Delete Policy"))) return;

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
        return window.olApiError(data, "Failed to delete policy");
    }

    if (totpEnabled) {
        const result = await window.ol2FA(doDelete);
        if (!result) return;
    } else {
        const err = await doDelete();
        if (err) { window.olToast(err, "error"); return; }
    }
    window.location.reload();
};

window.handleDraft = async function (id: string, action: string) {
    const bodyObj: Record<string, unknown> = {};
    if (action === "deny") {
        const reason = await window.olPrompt("Reason for denial (optional):", "Enter reason...", "Deny Draft");
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
            return window.olApiError(data, "Failed");
        } catch {
            return "Network error";
        }
    }

    if (totpEnabled) {
        const result = await window.ol2FA(doDraft);
        if (!result) return;
    } else {
        const err = await doDraft();
        if (err) { window.olToast(err, "error"); return; }
    }
    window.location.reload();
};
