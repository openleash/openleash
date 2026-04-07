/**
 * Client-side logic for the admin agents page.
 */
import "./style.css";
import { olToast, olFieldError, olApiError } from "../../shared/common";

function toggleInviteForm() {
    document.getElementById("invite-form")!.classList.toggle("hidden");
}

async function createAgentInvite() {
    const select = document.getElementById("owner-select") as HTMLSelectElement;
    const ownerId = select.value;
    const selectedOption = select.options[select.selectedIndex];
    const ownerType = selectedOption?.dataset.type || "user";
    const btn = document.getElementById("invite-btn") as HTMLButtonElement;

    olFieldError("owner-select", "");
    if (!ownerId) {
        olFieldError("owner-select", "Please select an owner");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Creating invite...";

    const url = ownerType === "org"
        ? "/v1/admin/organizations/" + encodeURIComponent(ownerId) + "/agent-invite"
        : "/v1/admin/users/" + encodeURIComponent(ownerId) + "/agent-invite";

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(olApiError(err, "Failed to create invite"));
        }

        const data = await res.json();
        const baseUrl = window.location.origin;
        const inviteUrl = baseUrl + "/v1/agents/register-with-invite?invite_id=" + encodeURIComponent(data.invite_id) + "&invite_token=" + encodeURIComponent(data.invite_token);

        document.getElementById("invite-url")!.textContent = inviteUrl;
        document.getElementById("invite-result")!.classList.remove("hidden");
        document.getElementById("invite-form")!.classList.add("hidden");

        olToast("Agent invite created", "success");
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Create Invite";
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

document.querySelectorAll<HTMLElement>("[data-toggle-invite]").forEach((el) => {
    el.addEventListener("click", toggleInviteForm);
});
document.getElementById("invite-btn")?.addEventListener("click", createAgentInvite);
document.getElementById("btn-copy-invite")?.addEventListener("click", copyInviteUrl);
document.getElementById("btn-dismiss-invite")?.addEventListener("click", () => {
    document.getElementById("invite-result")!.classList.add("hidden");
});
