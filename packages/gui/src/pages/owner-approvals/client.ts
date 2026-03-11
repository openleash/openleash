/**
 * Client-side logic for the owner approvals page.
 */
import "./style.css";
import { olToast, olPrompt, ol2FA, olApiError } from "../../shared/common";

interface OwnerApprovalsPageData {
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerApprovalsPageData;
    }
}

const { totpEnabled } = window.__PAGE_DATA__;

async function handleApproval(id: string, action: string) {
    const token = sessionStorage.getItem("openleash_session");
    const bodyObj: Record<string, unknown> = {};
    if (action === "deny") {
        const reason = await olPrompt("Reason for denial (optional):", "Enter reason...", "Deny Request");
        if (reason === null) return;
        if (reason) bodyObj.reason = reason;
    }

    async function doApproval(totpCode?: string): Promise<string | null> {
        if (totpCode) bodyObj.totp_code = totpCode;
        try {
            const res = await fetch("/v1/owner/approval-requests/" + id + "/" + action, {
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
        const result = await ol2FA(doApproval);
        if (!result) return;
        window.location.reload();
    } else {
        const err = await doApproval();
        if (err) olToast(err, "error");
        else window.location.reload();
    }
}

// ─── Event bindings ─────────────────────────────────────────────────

document.querySelectorAll<HTMLElement>(".accordion-row").forEach((row) => {
    row.addEventListener("click", () => {
        const detail = row.nextElementSibling as HTMLElement;
        if (detail?.classList.contains("accordion-detail")) {
            detail.classList.toggle("open");
            row.classList.toggle("expanded");
        }
    });
});

document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-handle-approval]");
    if (btn) {
        e.stopPropagation();
        handleApproval(btn.dataset.handleApproval!, btn.dataset.approvalAction!);
    }
});
