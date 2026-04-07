import { olToast, olFieldError, olClearFieldErrors, olConfirm, olApiError } from "../../shared/common.js";
import "./style.css";

interface CompanyIdEntry {
    id_type: string;
    country?: string;
    id_value: string;
    verification_level: string;
    verified_at: string | null;
    added_at: string;
}

interface OrgPageData {
    orgId?: string;
    role?: string;
    companyIds?: CompanyIdEntry[];
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

// ─── Change member role ───────────────────────────────────────────────

document.querySelectorAll<HTMLSelectElement>(".oorg-role-select").forEach((select) => {
    select.addEventListener("change", async () => {
        const userId = select.dataset.userId!;
        const currentRole = select.dataset.currentRole!;
        const newRole = select.value;

        try {
            const res = await fetch(`/v1/owner/organizations/${pageData.orgId}/members/${userId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                olToast(olApiError(err, "Failed to update role"), "error");
                select.value = currentRole;
                return;
            }

            select.dataset.currentRole = newRole;
            olToast("Role updated", "success");
        } catch {
            olToast("Network error", "error");
            select.value = currentRole;
        }
    });
});

// ─── Delete organization ──────────────────────────────────────────────

const btnDelete = document.getElementById("btn-delete-org") as HTMLButtonElement | null;

btnDelete?.addEventListener("click", async () => {
    if (!(await olConfirm("Are you sure you want to permanently delete this organization? All memberships, agents, and policies will be removed. This cannot be undone.", "Delete Organization"))) return;

    btnDelete.disabled = true;
    btnDelete.textContent = "Deleting\u2026";

    try {
        const res = await fetch(`/v1/owner/organizations/${pageData.orgId}`, {
            method: "DELETE",
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            olToast(olApiError(err, "Failed to delete organization"), "error");
            btnDelete.disabled = false;
            btnDelete.textContent = "Delete Organization";
            return;
        }

        olToast("Organization deleted", "success");
        setTimeout(() => { window.location.href = "/gui/organizations"; }, 800);
    } catch {
        olToast("Network error", "error");
        btnDelete.disabled = false;
        btnDelete.textContent = "Delete Organization";
    }
});

// ─── Company IDs management ───────────────────────────────────────────

const btnAddCid = document.getElementById("btn-add-cid");
const cidForm = document.getElementById("add-cid-form");
const btnSubmitCid = document.getElementById("btn-submit-cid") as HTMLButtonElement | null;
const btnCancelCid = document.getElementById("btn-cancel-cid");
const cidTypeSelect = document.getElementById("cid-type") as HTMLSelectElement | null;
const cidCountryGroup = document.getElementById("cid-country-group");
const cidCountrySelect = document.getElementById("cid-country") as HTMLSelectElement | null;
const cidValueInput = document.getElementById("cid-value") as HTMLInputElement | null;

// Show/hide country field based on ID type
cidTypeSelect?.addEventListener("change", () => {
    if (cidCountryGroup) {
        cidCountryGroup.style.display = cidTypeSelect.value === "COMPANY_REG" ? "" : "none";
    }
});
// Initialize visibility
if (cidCountryGroup && cidTypeSelect) {
    cidCountryGroup.style.display = cidTypeSelect.value === "COMPANY_REG" ? "" : "none";
}

btnAddCid?.addEventListener("click", () => {
    cidForm?.classList.remove("hidden");
    btnAddCid.classList.add("hidden");
    cidValueInput?.focus();
});

btnCancelCid?.addEventListener("click", () => {
    cidForm?.classList.add("hidden");
    btnAddCid?.classList.remove("hidden");
    olClearFieldErrors("add-cid-form");
    if (cidValueInput) cidValueInput.value = "";
});

async function saveCompanyIds(companyIds: Array<{ id_type: string; country?: string; id_value: string; verification_level: string; verified_at: string | null; added_at: string }>) {
    const res = await fetch(`/v1/owner/organizations/${pageData.orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_ids: companyIds }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(olApiError(err, "Failed to update company IDs"));
    }
}

function getCompanyIds(): CompanyIdEntry[] {
    return [...(pageData.companyIds ?? [])];
}

btnSubmitCid?.addEventListener("click", async () => {
    olClearFieldErrors("add-cid-form");
    const idType = cidTypeSelect?.value || "COMPANY_REG";
    const country = cidCountrySelect?.value || undefined;
    const idValue = cidValueInput?.value.trim();

    if (!idValue) {
        olFieldError("cid-value", "ID value is required");
        return;
    }
    if (idType === "COMPANY_REG" && !country) {
        olFieldError("cid-value", "Country is required for Company Registration");
        return;
    }

    btnSubmitCid.disabled = true;
    btnSubmitCid.textContent = "Adding\u2026";

    try {
        const existing = getCompanyIds();
        existing.push({
            id_type: idType,
            ...(country ? { country } : {}),
            id_value: idValue,
            verification_level: "UNVERIFIED",
            verified_at: null,
            added_at: new Date().toISOString(),
        });
        await saveCompanyIds(existing);
        olToast("Company ID added", "success");
        setTimeout(() => { window.location.reload(); }, 800);
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    } finally {
        btnSubmitCid.disabled = false;
        btnSubmitCid.textContent = "Add";
    }
});

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-remove-cid").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (!(await olConfirm("Remove this company ID?", "Remove"))) return;

        btn.disabled = true;
        try {
            const existing = getCompanyIds();
            existing.splice(idx, 1);
            await saveCompanyIds(existing);
            olToast("Company ID removed", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch (err: unknown) {
            olToast(String((err as Error).message || err), "error");
            btn.disabled = false;
        }
    });
});
