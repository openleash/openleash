/**
 * Client-side logic for the owner agents page.
 */

interface OwnerAgentsPageData {
    totpEnabled: boolean;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerAgentsPageData;
        revokeAgent: (principalId: string) => Promise<void>;
        createAgentInvite: () => Promise<void>;
        copyInviteUrl: () => Promise<void>;
    }
}

const { totpEnabled } = window.__PAGE_DATA__;

window.revokeAgent = async function (principalId: string) {
    if (!(await window.olConfirm("Are you sure you want to revoke this agent?", "Revoke Agent"))) return;
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
        return window.olApiError(data, "Failed to revoke agent");
    }

    if (totpEnabled) {
        const result = await window.ol2FA(doRevoke);
        if (!result) return;
        window.location.reload();
    } else {
        const err = await doRevoke();
        if (err) window.olToast(err, "error");
        else window.location.reload();
    }
};

window.createAgentInvite = async function () {
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
        window.olToast("Failed to create agent invite", "error");
    }
};

window.copyInviteUrl = async function () {
    const url = document.getElementById("invite-url")!.textContent!;
    await navigator.clipboard.writeText(url);
    const btn = (event as Event).target as HTMLButtonElement;
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 2000);
};
