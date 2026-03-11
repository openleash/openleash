/**
 * Client-side logic for the owner approvals page.
 */

interface OwnerApprovalsPageData {
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerApprovalsPageData;
        toggleApproval: (id: string) => void;
        handleApproval: (id: string, action: string) => Promise<void>;
    }
}

const { totpEnabled } = window.__PAGE_DATA__;

window.toggleApproval = function (id: string) {
    const detail = document.getElementById("detail-" + id)!;
    const row = detail.previousElementSibling as HTMLElement;
    detail.classList.toggle("open");
    row.classList.toggle("expanded");
};

window.handleApproval = async function (id: string, action: string) {
    const token = sessionStorage.getItem("openleash_session");
    const bodyObj: Record<string, unknown> = {};
    if (action === "deny") {
        const reason = await window.olPrompt("Reason for denial (optional):", "Enter reason...", "Deny Request");
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
            return window.olApiError(data, "Failed");
        } catch {
            return "Network error";
        }
    }

    if (totpEnabled) {
        const result = await window.ol2FA(doApproval);
        if (!result) return;
        window.location.reload();
    } else {
        const err = await doApproval();
        if (err) window.olToast(err, "error");
        else window.location.reload();
    }
};
