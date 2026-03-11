/**
 * Client-side logic for the admin owners pages (list + detail).
 */

interface OwnersPageData {
    ownerId?: string;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnersPageData;
        toggleForm: () => void;
        createOwner: () => Promise<void>;
        toggleAccordion: (idx: number) => void;
        copyLink: () => void;
        adminDisableTotp: () => Promise<void>;
        generateInvite: () => Promise<void>;
    }
}

const pageData = window.__PAGE_DATA__ || {};

// ─── Owners list ────────────────────────────────────────────────────

window.toggleForm = function () {
    document.getElementById("owner-form")!.classList.toggle("hidden");
};

window.createOwner = async function () {
    const displayName = (document.getElementById("display-name") as HTMLInputElement).value.trim();
    const principalType = (document.getElementById("principal-type") as HTMLSelectElement).value;
    const btn = document.getElementById("create-btn") as HTMLButtonElement;

    window.olFieldError("display-name", "");
    if (!displayName) {
        window.olFieldError("display-name", "Display name is required");
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
            throw new Error(window.olApiError(err, "Failed to create owner"));
        }

        const result = await res.json();
        window.olToast("Owner created (ID: " + result.owner_principal_id.slice(0, 8) + "...)", "success");
        setTimeout(() => { window.location.reload(); }, 1000);
    } catch (err: unknown) {
        window.olToast(String((err as Error).message || err), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Create Owner";
    }
};

// ─── Owner detail ───────────────────────────────────────────────────

window.toggleAccordion = function (idx: number) {
    const row = document.getElementById("row-" + idx)!;
    const detail = document.getElementById("detail-" + idx)!;
    const isOpen = detail.classList.contains("open");
    if (isOpen) {
        detail.classList.remove("open");
        row.classList.remove("expanded");
    } else {
        detail.classList.add("open");
        row.classList.add("expanded");
    }
};

window.copyLink = function () {
    const linkText = document.getElementById("invite-link")!.textContent!;
    navigator.clipboard.writeText(linkText).then(() => {
        const btn = document.getElementById("copy-btn") as HTMLButtonElement;
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
};

window.adminDisableTotp = async function () {
    if (!(await window.olConfirm("Are you sure you want to disable 2FA for this owner? They will need to set it up again.", "Disable 2FA"))) return;
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
            window.olToast((err.error && err.error.message) || "Failed to disable 2FA", "error");
        }
    } catch {
        window.olToast("Network error", "error");
    }
};

window.generateInvite = async function () {
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
        window.olToast(String((err as Error).message || err), "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate Setup Invite";
    }
};
