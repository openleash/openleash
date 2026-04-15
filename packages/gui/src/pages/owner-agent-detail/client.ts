/**
 * Client-side logic for the owner agent detail page.
 */
import "./style.css";
import "../audit/style.css";
import { olToast, olConfirm, ol2FA, olApiError } from "../../shared/common";

interface AgentPageData {
    agentPrincipalId?: string;
    agentId?: string;
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: AgentPageData;
    }
}

const pageData = window.__PAGE_DATA__ || {};

// ─── Audit accordion expand/collapse ────────────────────────────────
document.querySelectorAll<HTMLElement>(".accordion-row").forEach((row) => {
    row.addEventListener("click", () => {
        const detail = row.nextElementSibling as HTMLElement;
        if (detail?.classList.contains("accordion-detail")) {
            detail.classList.toggle("open");
            row.classList.toggle("expanded");
        }
    });
});

// ─── Revoke agent ───────────────────────────────────────────────────
document.getElementById("btn-revoke-agent")?.addEventListener("click", async () => {
    const name = pageData.agentId || pageData.agentPrincipalId?.slice(0, 8) || "this agent";
    if (!(await olConfirm(`Are you sure you want to revoke agent "${name}"?`, "Revoke Agent"))) return;

    async function doRevoke(totpCode?: string): Promise<string | null> {
        const bodyObj: Record<string, unknown> = { status: "REVOKED" };
        if (totpCode) bodyObj.totp_code = totpCode;
        const res = await fetch(`/v1/owner/agents/${encodeURIComponent(pageData.agentPrincipalId!)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
        });
        if (res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return olApiError(data, "Failed to revoke agent");
    }

    if (pageData.totpEnabled) {
        const result = await ol2FA(doRevoke);
        if (!result) return;
        window.location.reload();
    } else {
        const err = await doRevoke();
        if (err) olToast(err, "error");
        else window.location.reload();
    }
});
