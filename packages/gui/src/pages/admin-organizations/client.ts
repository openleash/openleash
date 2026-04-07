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

interface AdminOrgPageData {
    orgId?: string;
    companyIds?: CompanyIdEntry[];
}

declare global {
    interface Window {
        __PAGE_DATA__: AdminOrgPageData;
    }
}

const pageData = window.__PAGE_DATA__ || {};

// ─── Add member ───────────────────────────────────────────────────────

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
        const res = await fetch(`/v1/admin/organizations/${pageData.orgId}/members`, {
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

// ─── Remove member ────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>(".aorg-btn-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const userId = btn.dataset.userId!;
        const userName = btn.dataset.userName!;

        if (!(await olConfirm(`Remove ${userName} from this organization?`, "Remove Member"))) return;

        btn.disabled = true;
        btn.textContent = "Removing\u2026";

        try {
            const res = await fetch(`/v1/admin/organizations/${pageData.orgId}/members/${userId}`, {
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

// ─── Change member role ───────────────────────────────────────────────

document.querySelectorAll<HTMLSelectElement>(".aorg-role-select").forEach((select) => {
    select.addEventListener("change", async () => {
        const userId = select.dataset.userId!;
        const currentRole = select.dataset.currentRole!;
        const newRole = select.value;

        try {
            const res = await fetch(`/v1/admin/organizations/${pageData.orgId}/members/${userId}`, {
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

// ─── Company IDs management ───────────────────────────────────────────

const btnAddCid = document.getElementById("btn-add-cid");
const cidForm = document.getElementById("add-cid-form");
const btnSubmitCid = document.getElementById("btn-submit-cid") as HTMLButtonElement | null;
const btnCancelCid = document.getElementById("btn-cancel-cid");
const cidTypeSelect = document.getElementById("cid-type") as HTMLSelectElement | null;
const cidCountryGroup = document.getElementById("cid-country-group");
const cidCountrySelect = document.getElementById("cid-country") as HTMLSelectElement | null;
const cidValueInput = document.getElementById("cid-value") as HTMLInputElement | null;

cidTypeSelect?.addEventListener("change", () => {
    if (cidCountryGroup) {
        cidCountryGroup.style.display = cidTypeSelect.value === "COMPANY_REG" ? "" : "none";
    }
});
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

async function saveCompanyIds(companyIds: CompanyIdEntry[]) {
    const res = await fetch(`/v1/admin/organizations/${pageData.orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_ids: companyIds }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(olApiError(err, "Failed to update company IDs"));
    }
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
        const existing = [...(pageData.companyIds ?? [])];
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

document.querySelectorAll<HTMLButtonElement>(".aorg-btn-remove-cid").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (!(await olConfirm("Remove this company ID?", "Remove"))) return;

        btn.disabled = true;
        try {
            const existing = [...(pageData.companyIds ?? [])];
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
