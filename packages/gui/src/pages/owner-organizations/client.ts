import { olToast, olFieldError, olClearFieldErrors, olConfirm, olApiError } from "../../shared/common.js";
import "./style.css";

interface OrgPageData {
    orgId?: string;
    role?: string;
}

declare global {
    interface Window {
        __PAGE_DATA__: OrgPageData;
    }
}

const pageData = window.__PAGE_DATA__ || {};

// ─── Create organization (list page) ──────────────────────────────────

const btnCreate = document.getElementById("btn-create-org");
const form = document.getElementById("create-org-form");
const btnSubmit = document.getElementById("btn-submit-org") as HTMLButtonElement | null;
const btnCancel = document.getElementById("btn-cancel-org");
const nameInput = document.getElementById("org-name") as HTMLInputElement | null;

btnCreate?.addEventListener("click", () => {
    form?.classList.remove("hidden");
    btnCreate.classList.add("hidden");
    nameInput?.focus();
});

btnCancel?.addEventListener("click", () => {
    form?.classList.add("hidden");
    btnCreate?.classList.remove("hidden");
    olClearFieldErrors("create-org-form");
    if (nameInput) nameInput.value = "";
});

btnSubmit?.addEventListener("click", async () => {
    olClearFieldErrors("create-org-form");
    const name = nameInput?.value.trim();
    if (!name) {
        olFieldError("org-name", "Organization name is required");
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Creating\u2026";

    try {
        const res = await fetch("/v1/owner/organizations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: name }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const msg = data?.error?.message || "Failed to create organization";
            olToast(msg, "error");
            return;
        }

        olToast("Organization created", "success");
        window.location.reload();
    } catch {
        olToast("Network error", "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Create";
    }
});

// ─── Add member (detail page, org_admin only) ─────────────────────────

const btnAddMember = document.getElementById("btn-add-member");
const addMemberForm = document.getElementById("add-member-form");
const btnSubmitMember = document.getElementById("btn-submit-member") as HTMLButtonElement | null;
const btnCancelMember = document.getElementById("btn-cancel-member");
const memberUserIdInput = document.getElementById("member-user-id") as HTMLInputElement | null;
const memberRoleSelect = document.getElementById("member-role") as HTMLSelectElement | null;

btnAddMember?.addEventListener("click", () => {
    addMemberForm?.classList.remove("hidden");
    btnAddMember.classList.add("hidden");
    memberUserIdInput?.focus();
});

btnCancelMember?.addEventListener("click", () => {
    addMemberForm?.classList.add("hidden");
    btnAddMember?.classList.remove("hidden");
    olClearFieldErrors("add-member-form");
    if (memberUserIdInput) memberUserIdInput.value = "";
});

btnSubmitMember?.addEventListener("click", async () => {
    olClearFieldErrors("add-member-form");
    const userId = memberUserIdInput?.value.trim();
    if (!userId) {
        olFieldError("member-user-id", "User Principal ID is required");
        return;
    }

    const role = memberRoleSelect?.value || "org_member";
    const isEmail = userId.includes("@");
    const payload = isEmail
        ? { email: userId, role }
        : { user_principal_id: userId, role };

    btnSubmitMember.disabled = true;
    btnSubmitMember.textContent = "Adding\u2026";

    try {
        const res = await fetch(`/v1/owner/organizations/${pageData.orgId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            olToast(olApiError(err, "Failed to add member"), "error");
            return;
        }

        olToast("Member added", "success");
        setTimeout(() => { window.location.reload(); }, 800);
    } catch {
        olToast("Network error", "error");
    } finally {
        btnSubmitMember.disabled = false;
        btnSubmitMember.textContent = "Add";
    }
});

// ─── Remove member (detail page, org_admin only) ──────────────────────

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const userId = btn.dataset.userId!;
        const userName = btn.dataset.userName!;

        if (!(await olConfirm(`Remove ${userName} from this organization?`, "Remove Member"))) return;

        btn.disabled = true;
        btn.textContent = "Removing\u2026";

        try {
            const res = await fetch(`/v1/owner/organizations/${pageData.orgId}/members/${userId}`, {
                method: "DELETE",
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                olToast(olApiError(err, "Failed to remove member"), "error");
                btn.disabled = false;
                btn.textContent = "Remove";
                return;
            }

            olToast("Member removed", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch {
            olToast("Network error", "error");
            btn.disabled = false;
            btn.textContent = "Remove";
        }
    });
});

// ─── Leave organization ───────────────────────────────────────────────

const btnLeave = document.getElementById("btn-leave-org") as HTMLButtonElement | null;

btnLeave?.addEventListener("click", async () => {
    if (!(await olConfirm("Are you sure you want to leave this organization? You will lose access to its agents and policies.", "Leave Organization"))) return;

    btnLeave.disabled = true;
    btnLeave.textContent = "Leaving\u2026";

    try {
        const res = await fetch(`/v1/owner/organizations/${pageData.orgId}/leave`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            olToast(olApiError(err, "Failed to leave organization"), "error");
            btnLeave.disabled = false;
            btnLeave.textContent = "Leave Organization";
            return;
        }

        olToast("You have left the organization", "success");
        setTimeout(() => { window.location.href = "/gui/organizations"; }, 800);
    } catch {
        olToast("Network error", "error");
        btnLeave.disabled = false;
        btnLeave.textContent = "Leave Organization";
    }
});
