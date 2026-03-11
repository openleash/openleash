/**
 * Client-side logic for the admin owners pages (list + detail).
 */
import "../styles/pages/config-block.css";
import { olToast, olFieldError, olConfirm, olApiError } from "../common";

interface OwnersPageData {
    ownerId?: string;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnersPageData;
    }
}

const pageData = window.__PAGE_DATA__ || {};

// ─── Owners list ────────────────────────────────────────────────────

function toggleForm() {
    document.getElementById("owner-form")!.classList.toggle("hidden");
}

async function createOwner() {
    const displayName = (document.getElementById("display-name") as HTMLInputElement).value.trim();
    const principalType = (document.getElementById("principal-type") as HTMLSelectElement).value;
    const btn = document.getElementById("create-btn") as HTMLButtonElement;

    olFieldError("display-name", "");
    if (!displayName) {
        olFieldError("display-name", "Display name is required");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Creating...";

    try {
        const res = await fetch("/v1/admin/owners", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ principal_type: principalType, display_name: displayName }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(olApiError(err, "Failed to create owner"));
        }

        const result = await res.json();
        olToast("Owner created (ID: " + result.owner_principal_id.slice(0, 8) + "...)", "success");
        setTimeout(() => { window.location.reload(); }, 1000);
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Create Owner";
    }
}

// ─── Owner detail ───────────────────────────────────────────────────

function copyLink() {
    const linkText = document.getElementById("invite-link")!.textContent!;
    navigator.clipboard.writeText(linkText).then(() => {
        const btn = document.getElementById("copy-btn") as HTMLButtonElement;
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
}

async function adminDisableTotp() {
    if (!(await olConfirm("Are you sure you want to disable 2FA for this owner? They will need to set it up again.", "Disable 2FA"))) return;
    const ownerId = pageData.ownerId!;
    try {
        const res = await fetch("/v1/admin/owners/" + ownerId + "/disable-totp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        if (res.ok) {
            window.location.reload();
        } else {
            const err = await res.json();
            olToast((err.error && err.error.message) || "Failed to disable 2FA", "error");
        }
    } catch {
        olToast("Network error", "error");
    }
}

async function generateInvite() {
    const ownerId = pageData.ownerId!;
    const btn = document.getElementById("invite-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Generating...";

    try {
        const res = await fetch("/v1/admin/owners/" + ownerId + "/setup-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error ? err.error.message : "Failed to generate invite");
        }

        const data = await res.json();
        document.getElementById("invite-result")!.classList.remove("hidden");
        const setupUrl = window.location.origin + "/gui/owner/setup?invite_id=" + encodeURIComponent(data.invite_id) + "&invite_token=" + encodeURIComponent(data.invite_token) + "&owner_id=" + encodeURIComponent(ownerId);
        document.getElementById("invite-link")!.textContent = setupUrl;
        btn.style.display = "none";
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate Setup Invite";
    }
}

// ─── Event bindings ─────────────────────────────────────────────────

document.querySelectorAll<HTMLElement>("[data-toggle-form]").forEach((el) => {
    el.addEventListener("click", toggleForm);
});
document.getElementById("create-btn")?.addEventListener("click", createOwner);

// Owner detail page bindings
document.querySelectorAll<HTMLElement>(".accordion-row").forEach((row) => {
    row.addEventListener("click", () => {
        const detail = row.nextElementSibling as HTMLElement;
        if (detail?.classList.contains("accordion-detail")) {
            detail.classList.toggle("open");
            row.classList.toggle("expanded");
        }
    });
});
document.getElementById("invite-btn")?.addEventListener("click", generateInvite);
document.getElementById("copy-btn")?.addEventListener("click", copyLink);
document.getElementById("btn-admin-disable-totp")?.addEventListener("click", adminDisableTotp);
