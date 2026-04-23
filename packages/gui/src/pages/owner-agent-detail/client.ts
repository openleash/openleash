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

// ─── Transfer agent to organization ─────────────────────────────────
const transferModal = document.getElementById("transfer-modal");
const transferBtn = document.getElementById("btn-transfer-agent");
const transferCancel = document.getElementById("btn-transfer-cancel");
const transferConfirm = document.getElementById("btn-transfer-confirm");
const transferError = document.getElementById("transfer-modal-error");
const transferSelect = document.getElementById("transfer-org-select") as HTMLSelectElement | null;

function closeTransferModal() {
    transferModal?.classList.remove("open");
    if (transferError) transferError.textContent = "";
}

transferBtn?.addEventListener("click", () => {
    transferModal?.classList.add("open");
});
transferCancel?.addEventListener("click", closeTransferModal);
transferModal?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeTransferModal();
});

transferConfirm?.addEventListener("click", async () => {
    if (!transferSelect || !pageData.agentPrincipalId) return;
    const targetOrgId = transferSelect.value;
    const selectedOption = transferSelect.selectedOptions[0];
    const targetSlug = selectedOption?.dataset.slug ?? "";
    if (!targetOrgId) {
        if (transferError) transferError.textContent = "Pick an organization.";
        return;
    }

    (transferConfirm as HTMLButtonElement).disabled = true;
    const res = await fetch(
        `/v1/owner/agents/${encodeURIComponent(pageData.agentPrincipalId)}/transfer`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_org_id: targetOrgId }),
        },
    );

    if (res.ok) {
        olToast("Agent transferred", "success");
        const dest = targetSlug
            ? `/gui/orgs/${encodeURIComponent(targetSlug)}/agents/${encodeURIComponent(pageData.agentPrincipalId)}`
            : `/gui/agents/${encodeURIComponent(pageData.agentPrincipalId)}`;
        window.location.href = dest;
        return;
    }

    const data = await res.json().catch(() => ({}));
    if (transferError) transferError.textContent = olApiError(data, "Transfer failed");
    (transferConfirm as HTMLButtonElement).disabled = false;
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
