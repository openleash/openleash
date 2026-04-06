/**
 * Client-side logic for the owner setup page.
 */
import "../../shared/styles/auth.css";
import "./style.css";

const params = new URLSearchParams(window.location.search);
const inviteId = params.get("invite_id");
const inviteToken = params.get("invite_token");
const ownerIdParam = params.get("owner_id");
let loggedIn = false;
let userPrincipalId: string | null = null;

if (!inviteId || !inviteToken) {
    document.getElementById("missing-params")!.style.display = "block";
} else {
    document.getElementById("setup-form")!.style.display = "block";
}

function goToLogin() {
    const id = userPrincipalId || ownerIdParam;
    window.location.href = id
        ? "/gui/login?owner_id=" + encodeURIComponent(id)
        : "/gui/login";
}

document.getElementById("setup-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("error-msg") as HTMLElement;
    errorEl.style.display = "none";

    const passphrase = (document.getElementById("passphrase") as HTMLInputElement).value;
    const confirm = (document.getElementById("passphrase-confirm") as HTMLInputElement).value;

    if (passphrase !== confirm) {
        errorEl.textContent = "Passphrases do not match";
        errorEl.style.display = "block";
        return;
    }
    if (passphrase.length < 8) {
        errorEl.textContent = "Passphrase must be at least 8 characters";
        errorEl.style.display = "block";
        return;
    }

    const btn = document.getElementById("submit-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Setting up...";

    try {
        const res = await fetch("/v1/owner/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invite_id: inviteId, invite_token: inviteToken, passphrase }),
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data?.error?.message || "Setup failed";
            errorEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Set Up Account";
            return;
        }

        userPrincipalId = data.user_principal_id || ownerIdParam;

        // Auto-login to get session token for agent invite creation
        if (userPrincipalId) {
            try {
                const loginRes = await fetch("/v1/owner/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_principal_id: userPrincipalId, passphrase }),
                });
                if (loginRes.ok) {
                    const loginData = await loginRes.json();
                    document.cookie = "openleash_session=" + loginData.token + "; path=/; SameSite=Strict";
                    loggedIn = true;
                }
            } catch {
                // Login failed — agent invite won't be available
            }
        }

        document.getElementById("setup-form")!.style.display = "none";
        document.getElementById("success-msg")!.style.display = "block";

        if (!loggedIn) {
            document.getElementById("create-invite-btn")!.style.display = "none";
        }
    } catch {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Set Up Account";
    }
});

async function createAgentInvite() {
    const btn = document.getElementById("create-invite-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Creating invite...";

    try {
        const res = await fetch("/v1/owner/agent-invites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        if (!res.ok) throw new Error("Failed to create invite");

        const data = await res.json();
        const baseUrl = window.location.origin;
        const inviteUrl = baseUrl + "/v1/agents/register-with-invite?invite_id=" + encodeURIComponent(data.invite_id) + "&invite_token=" + encodeURIComponent(data.invite_token);

        document.getElementById("invite-url-box")!.textContent = inviteUrl;
        document.getElementById("invite-result")!.style.display = "block";
        btn.style.display = "none";
        document.getElementById("skip-btn")!.style.display = "none";
    } catch {
        btn.disabled = false;
        btn.textContent = "Create Agent Invite";
        document.getElementById("error-msg")!.textContent = "Failed to create agent invite";
    }
}

async function copyInviteUrl(e: Event) {
    const url = document.getElementById("invite-url-box")!.textContent!;
    await navigator.clipboard.writeText(url);
    const btn = e.target as HTMLButtonElement;
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 2000);
}

// ─── Event bindings ─────────────────────────────────────────────────

document.getElementById("create-invite-btn")?.addEventListener("click", createAgentInvite);
document.getElementById("btn-copy-invite")?.addEventListener("click", copyInviteUrl);
document.querySelectorAll<HTMLElement>("[data-go-to-login]").forEach((el) => {
    el.addEventListener("click", goToLogin);
});
