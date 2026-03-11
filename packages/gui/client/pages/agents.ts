/**
 * Client-side logic for the admin agents page.
 */

declare global {
    interface Window {
        toggleInviteForm: () => void;
        createAgentInvite: () => Promise<void>;
        copyInviteUrl: () => Promise<void>;
    }
}

window.toggleInviteForm = function () {
    document.getElementById("invite-form")!.classList.toggle("hidden");
};

window.createAgentInvite = async function () {
    const ownerPrincipalId = (document.getElementById("owner-select") as HTMLSelectElement).value;
    const btn = document.getElementById("invite-btn") as HTMLButtonElement;

    window.olFieldError("owner-select", "");
    if (!ownerPrincipalId) {
        window.olFieldError("owner-select", "Please select an owner");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Creating invite...";

    try {
        const res = await fetch("/v1/admin/owners/" + encodeURIComponent(ownerPrincipalId) + "/agent-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(window.olApiError(err, "Failed to create invite"));
        }

        const data = await res.json();
        const baseUrl = window.location.origin;
        const inviteUrl = baseUrl + "/v1/agents/register-with-invite?invite_id=" + encodeURIComponent(data.invite_id) + "&invite_token=" + encodeURIComponent(data.invite_token);

        document.getElementById("invite-url")!.textContent = inviteUrl;
        document.getElementById("invite-result")!.classList.remove("hidden");
        document.getElementById("invite-form")!.classList.add("hidden");

        window.olToast("Agent invite created", "success");
    } catch (err: unknown) {
        window.olToast(String((err as Error).message || err), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Create Invite";
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
