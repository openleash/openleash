/**
 * Client-side logic for the owner approvals page.
 */
import "./style.css";
import { olToast, olPrompt, ol2FA, olApiError, bindAccordionRows } from "../../shared/common";

interface OwnerApprovalsPageData {
    totpEnabled: boolean;
    pendingPage: number;
    pendingPageSize: number;
    resolvedPage: number;
    resolvedPageSize: number;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerApprovalsPageData;
    }
}

const pageData = window.__PAGE_DATA__;
const { totpEnabled } = pageData;

async function handleApproval(id: string, action: string) {
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

bindAccordionRows();

document.querySelectorAll<HTMLElement>("[data-handle-approval]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleApproval(btn.dataset.handleApproval!, btn.dataset.approvalAction!);
    });
});

// Pending page size change
document.getElementById("pending-page-size")?.addEventListener("change", (e) => {
    const newSize = (e.target as HTMLSelectElement).value;
    window.location.href = `/gui/approvals?pending_page=1&pending_page_size=${newSize}&resolved_page=${pageData.resolvedPage}&resolved_page_size=${pageData.resolvedPageSize}`;
});

// Resolved page size change
document.getElementById("resolved-page-size")?.addEventListener("change", (e) => {
    const newSize = (e.target as HTMLSelectElement).value;
    window.location.href = `/gui/approvals?pending_page=${pageData.pendingPage}&pending_page_size=${pageData.pendingPageSize}&resolved_page=1&resolved_page_size=${newSize}`;
});
