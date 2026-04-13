/**
 * Client-side logic for the admin agent detail page.
 */
import "./style.css";
import { olToast, olConfirm, olApiError } from "../../shared/common";

interface AgentPageData {
    agentPrincipalId?: string;
    agentId?: string;
}

declare global {
    interface Window {
        __PAGE_DATA__: AgentPageData;
    }
}

const pageData = window.__PAGE_DATA__ || {};

document.getElementById("btn-delete-agent")?.addEventListener("click", async () => {
    const name = pageData.agentId || pageData.agentPrincipalId?.slice(0, 8) || "this agent";
    if (!(await olConfirm(
        `Are you sure you want to permanently delete agent "${name}"? This will also remove all policies targeting this agent, its approval requests, and policy drafts. This action cannot be undone.`,
        "Delete Agent",
    ))) return;

    const btn = document.getElementById("btn-delete-agent") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Deleting\u2026";

    try {
        const res = await fetch(`/v1/admin/agents/${encodeURIComponent(pageData.agentPrincipalId!)}`, {
            method: "DELETE",
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            olToast(olApiError(err, "Failed to delete agent"), "error");
            btn.disabled = false;
            btn.textContent = "Delete Agent";
            return;
        }
        olToast("Agent deleted", "success");
        setTimeout(() => { window.location.href = "/gui/admin/agents"; }, 800);
    } catch {
        olToast("Network error", "error");
        btn.disabled = false;
        btn.textContent = "Delete Agent";
    }
});
