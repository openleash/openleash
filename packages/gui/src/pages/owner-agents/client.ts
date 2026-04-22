/**
 * Client-side logic for the owner agents page.
 */
import "./style.css";
import { olToast, olConfirm, ol2FA, olApiError } from "../../shared/common";

interface OwnerAgentsPageData {
    totpEnabled: boolean;
    ownerType: "user" | "org";
    ownerId: string;
    ownerDisplayName: string;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerAgentsPageData;
    }
}

const { totpEnabled, ownerType, ownerId } = window.__PAGE_DATA__;

async function revokeAgent(principalId: string) {
    if (!(await olConfirm("Are you sure you want to revoke this agent?", "Revoke Agent"))) return;
    async function doRevoke(totpCode?: string): Promise<string | null> {
        const bodyObj: Record<string, unknown> = { status: "REVOKED" };
        if (totpCode) bodyObj.totp_code = totpCode;
        const res = await fetch("/v1/owner/agents/" + principalId, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
        });
        if (res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return olApiError(data, "Failed to revoke agent");
    }

    if (totpEnabled) {
        const result = await ol2FA(doRevoke);
        if (!result) return;
        window.location.reload();
    } else {
        const err = await doRevoke();
        if (err) olToast(err, "error");
        else window.location.reload();
    }
}

async function createAgentInvite() {
    // Invite targets the current scope's owner. To invite an agent for a
    // different owner, switch scope via the sidebar first.
    const url = ownerType === "org"
        ? `/v1/owner/organizations/${encodeURIComponent(ownerId)}/agent-invites`
        : "/v1/owner/agent-invites";
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(olApiError(err, "Failed to create invite"));
        }
        const data = await res.json();
        const baseUrl = window.location.origin;
        const inviteUrl = baseUrl + "/v1/agents/register-with-invite?invite_id=" + encodeURIComponent(data.invite_id) + "&invite_token=" + encodeURIComponent(data.invite_token);
        document.getElementById("invite-url")!.textContent = inviteUrl;
        document.getElementById("invite-result")!.style.display = "block";
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    }
}

async function copyInviteUrl(e: Event) {
    const url = document.getElementById("invite-url")!.textContent!;
    await navigator.clipboard.writeText(url);
    const btn = e.target as HTMLButtonElement;
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 2000);
}

// ─── Event bindings ─────────────────────────────────────────────────

document.getElementById("btn-create-invite")?.addEventListener("click", createAgentInvite);
document.getElementById("btn-copy-invite")?.addEventListener("click", copyInviteUrl);
document.getElementById("btn-dismiss-invite")?.addEventListener("click", () => {
    document.getElementById("invite-result")!.style.display = "none";
    document.getElementById("btn-create-invite")?.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-revoke-agent]");
    if (btn) revokeAgent(btn.dataset.revokeAgent!);
});
