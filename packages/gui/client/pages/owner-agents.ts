/**
 * Client-side logic for the owner agents page.
 */
import { olToast, olConfirm, ol2FA, olApiError } from "../common";

interface OwnerAgentsPageData {
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerAgentsPageData;
    }
}

const { totpEnabled } = window.__PAGE_DATA__;

async function revokeAgent(principalId: string) {
    if (!(await olConfirm("Are you sure you want to revoke this agent?", "Revoke Agent"))) return;
    const token = sessionStorage.getItem("openleash_session");

    async function doRevoke(totpCode?: string): Promise<string | null> {
        const bodyObj: Record<string, unknown> = { status: "REVOKED" };
        if (totpCode) bodyObj.totp_code = totpCode;
        const res = await fetch("/v1/owner/agents/" + principalId, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
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
    const token = sessionStorage.getItem("openleash_session");
    try {
        const res = await fetch("/v1/owner/agent-invites", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: "{}",
        });
        if (!res.ok) throw new Error("Failed to create invite");
        const data = await res.json();
        const baseUrl = window.location.origin;
        const inviteUrl = baseUrl + "/v1/agents/register-with-invite?invite_id=" + encodeURIComponent(data.invite_id) + "&invite_token=" + encodeURIComponent(data.invite_token);
        document.getElementById("invite-url")!.textContent = inviteUrl;
        document.getElementById("invite-result")!.style.display = "block";
    } catch {
        olToast("Failed to create agent invite", "error");
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
});

document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-revoke-agent]");
    if (btn) revokeAgent(btn.dataset.revokeAgent!);
});
