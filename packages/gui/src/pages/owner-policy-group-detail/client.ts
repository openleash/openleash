import "./style.css";
import "../owner-policy-groups/style.css";
import { olToast, olApiError, olConfirm } from "../../shared/common";

interface PageData {
    orgId: string;
    orgSlug: string;
    groupId: string;
    groupSlug: string;
    canManage: boolean;
}

const pageData = (window as unknown as { __PAGE_DATA__: PageData }).__PAGE_DATA__;

// ─── Add member ─────────────────────────────────────────────────────
const addAgentSelect = document.getElementById("opg-add-agent") as HTMLSelectElement | null;
const addBtn = document.getElementById("opg-add-btn");

addBtn?.addEventListener("click", async () => {
    const agentId = addAgentSelect?.value;
    if (!agentId) {
        olToast("Pick an agent first", "error");
        return;
    }

    (addBtn as HTMLButtonElement).disabled = true;
    const res = await fetch(
        `/v1/owner/organizations/${encodeURIComponent(pageData.orgId)}/policy-groups/${encodeURIComponent(pageData.groupId)}/agents/${encodeURIComponent(agentId)}`,
        { method: "POST" },
    );

    if (res.ok) {
        olToast("Agent added to group", "success");
        window.location.reload();
        return;
    }

    const data = await res.json().catch(() => ({}));
    olToast(olApiError(data, "Add failed"), "error");
    (addBtn as HTMLButtonElement).disabled = false;
});

// ─── Remove member ──────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>("[data-remove-member]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const agentId = btn.getAttribute("data-remove-member");
        if (!agentId) return;

        if (!(await olConfirm("Remove this agent from the group?", "Remove member"))) return;

        (btn as HTMLButtonElement).disabled = true;
        const res = await fetch(
            `/v1/owner/organizations/${encodeURIComponent(pageData.orgId)}/policy-groups/${encodeURIComponent(pageData.groupId)}/agents/${encodeURIComponent(agentId)}`,
            { method: "DELETE" },
        );
        if (res.ok) {
            olToast("Removed", "success");
            window.location.reload();
            return;
        }
        const data = await res.json().catch(() => ({}));
        olToast(olApiError(data, "Remove failed"), "error");
        (btn as HTMLButtonElement).disabled = false;
    });
});

// ─── Delete group ───────────────────────────────────────────────────
document.getElementById("btn-delete-group")?.addEventListener("click", async () => {
    if (!(await olConfirm("Delete this policy group? This cannot be undone.", "Delete group"))) return;

    const res = await fetch(
        `/v1/owner/organizations/${encodeURIComponent(pageData.orgId)}/policy-groups/${encodeURIComponent(pageData.groupId)}`,
        { method: "DELETE" },
    );
    if (res.ok) {
        olToast("Group deleted", "success");
        window.location.href = `/gui/orgs/${encodeURIComponent(pageData.orgSlug)}/policy-groups`;
        return;
    }
    const data = await res.json().catch(() => ({}));
    const code = (data as { error?: { code?: string } })?.error?.code;
    if (code === "GROUP_HAS_POLICIES") {
        olToast("Unbind the policies targeting this group first.", "error");
    } else {
        olToast(olApiError(data, "Delete failed"), "error");
    }
});
