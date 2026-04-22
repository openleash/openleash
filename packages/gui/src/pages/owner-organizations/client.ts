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

interface ContactIdentityEntry {
    contact_id: string;
    type: string;
    value: string;
    verified: boolean;
}

interface DomainEntry {
    domain_id: string;
    domain: string;
    verification_level: string;
    verified_at: string | null;
    added_at: string;
}

interface CompanyRegInfoEntry {
    name: string;
    placeholder: string;
    help: string;
    errorHint: string;
}

interface OrgPageData {
    orgId?: string;
    role?: string;
    companyIds?: CompanyIdEntry[];
    contactIdentities?: ContactIdentityEntry[];
    domains?: DomainEntry[];
    companyRegInfo?: Record<string, CompanyRegInfoEntry>;
}

declare global {
    interface Window {
        __PAGE_DATA__: OrgPageData;
    }
}

const pageData = window.__PAGE_DATA__ || {};

// ─── Accept/decline org invites (list page) ──────────────────────────

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-accept").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const inviteId = btn.dataset.inviteId!;
        btn.disabled = true;
        btn.textContent = "Accepting\u2026";
        try {
            const res = await fetch(`/v1/owner/organization-invites/${inviteId}/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                olToast(olApiError(err, "Failed to accept invite"), "error");
                btn.disabled = false;
                btn.textContent = "Accept";
                return;
            }
            olToast("Invitation accepted", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch {
            olToast("Network error", "error");
            btn.disabled = false;
            btn.textContent = "Accept";
        }
    });
});

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-decline").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const inviteId = btn.dataset.inviteId!;
        if (!(await olConfirm("Decline this invitation?", "Decline"))) return;
        btn.disabled = true;
        try {
            const res = await fetch(`/v1/owner/organization-invites/${inviteId}/decline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                olToast(olApiError(err, "Failed to decline invite"), "error");
                btn.disabled = false;
                return;
            }
            olToast("Invitation declined", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch {
            olToast("Network error", "error");
            btn.disabled = false;
        }
    });
});

// ─── Create organization (list page) ──────────────────────────────────

const btnCreate = document.getElementById("btn-create-org");
const form = document.getElementById("create-org-form");
const btnSubmit = document.getElementById("btn-submit-org") as HTMLButtonElement | null;
const btnCancel = document.getElementById("btn-cancel-org");
const nameInput = document.getElementById("org-name") as HTMLInputElement | null;
const slugInput = document.getElementById("org-slug") as HTMLInputElement | null;
const slugPreview = document.getElementById("slug-preview");

/**
 * Browser-side slugify that mirrors the server-side `slugifyName` in core.
 * Used to auto-suggest a slug while the user types the display name. Kept
 * tiny — the server is authoritative and validates everything.
 */
function slugifyClient(input: string): string {
    return input
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/g, "");
}

// While the user has not typed a slug yet, keep the slug mirror in sync with
// the display name. Stop syncing as soon as they edit the slug manually.
let slugEditedManually = false;
nameInput?.addEventListener("input", () => {
    if (slugEditedManually || !slugInput) return;
    slugInput.value = slugifyClient(nameInput.value);
    if (slugPreview) slugPreview.textContent = slugInput.value || "your-slug";
});
slugInput?.addEventListener("input", () => {
    slugEditedManually = slugInput.value.length > 0;
    if (slugPreview) slugPreview.textContent = slugInput.value || "your-slug";
});

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
    if (slugInput) slugInput.value = "";
    slugEditedManually = false;
    if (slugPreview) slugPreview.textContent = "your-slug";
});

btnSubmit?.addEventListener("click", async () => {
    olClearFieldErrors("create-org-form");
    const name = nameInput?.value.trim();
    const slug = slugInput?.value.trim().toLowerCase();
    if (!name) {
        olFieldError("org-name", "Organization name is required");
        return;
    }
    if (!slug) {
        olFieldError("org-slug", "URL slug is required");
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Creating\u2026";

    try {
        const res = await fetch("/v1/owner/organizations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: name, slug }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            // Surface validation and collision errors on the slug field so
            // users can fix without losing their other form input.
            if ((res.status === 400 || res.status === 409) && data?.error?.message) {
                olFieldError("org-slug", data.error.message);
            } else {
                olToast(data?.error?.message || "Failed to create organization", "error");
            }
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

        olToast("Invitation sent", "success");
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
        setTimeout(() => { window.location.href = "/gui/orgs"; }, 800);
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
        setTimeout(() => { window.location.href = "/gui/orgs"; }, 800);
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
const cidHelp = document.getElementById("cid-help");

const CID_PLACEHOLDERS: Record<string, string> = {
    COMPANY_REG: "Select a country to see format",
    VAT: "e.g. SE556036079301 (with country prefix)",
    EORI: "e.g. SE5560360793 (country prefix + number)",
    LEI: "e.g. 5493006MHB84DD3ZDB09 (20 chars)",
    DUNS: "e.g. 123456789 (9 digits)",
    GLN: "e.g. 7350053850019 (13 digits)",
    ISIN: "e.g. US0378331005 (country + 10 chars)",
    TAX_ID: "e.g. EIN 12-3456789",
    CHAMBER_OF_COMMERCE: "e.g. KVK12345678",
    NAICS: "e.g. 541511 (2-6 digits)",
    SIC: "e.g. 7372 (4 digits)",
};

const CID_HELP: Record<string, string> = {
    COMPANY_REG: "Select a country to see issuing authority",
    VAT: "EU Value Added Tax number \u2014 includes country prefix. Issued by national tax authority.",
    EORI: "Required for EU customs. Issued by national customs authority.",
    LEI: "Global legal entity identifier (ISO 17442). Obtain from any GLEIF-accredited issuer.",
    DUNS: "Dun & Bradstreet number. Apply at dnb.com.",
    GLN: "GS1 Global Location Number. Obtain from your national GS1 organization.",
    ISIN: "Securities identifier. Assigned by national numbering agencies.",
    TAX_ID: "General tax ID for non-EU countries. Issued by national tax authority.",
    CHAMBER_OF_COMMERCE: "Registration at your national or regional Chamber of Commerce.",
    NAICS: "North American industry code. Look up at census.gov/naics.",
    SIC: "Standard industry code. Look up at sec.gov/divisions/corpfin/sic.",
};

function updateCidFormHints() {
    const idType = cidTypeSelect?.value || "COMPANY_REG";
    if (cidCountryGroup) {
        cidCountryGroup.style.display = idType === "COMPANY_REG" ? "" : "none";
    }
    if (idType === "COMPANY_REG") {
        const country = cidCountrySelect?.value || "";
        const info = country ? pageData.companyRegInfo?.[country] : null;
        if (cidValueInput) {
            cidValueInput.placeholder = info?.placeholder ?? "Select a country to see format";
        }
        if (cidHelp) {
            cidHelp.textContent = info ? `${info.name} \u2014 ${info.help}` : "Select a country to see issuing authority";
        }
    } else {
        if (cidValueInput) {
            cidValueInput.placeholder = CID_PLACEHOLDERS[idType] || "";
        }
        if (cidHelp) {
            cidHelp.textContent = CID_HELP[idType] || "";
        }
    }
}

cidTypeSelect?.addEventListener("change", updateCidFormHints);
cidCountrySelect?.addEventListener("change", updateCidFormHints);
updateCidFormHints();

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

// ─── Cancel pending invite ────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-cancel-invite").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const inviteId = btn.dataset.inviteId!;
        const userName = btn.dataset.userName!;
        if (!(await olConfirm(`Cancel the invitation for ${userName}?`, "Cancel Invite"))) return;

        btn.disabled = true;
        btn.textContent = "Cancelling\u2026";

        try {
            const res = await fetch(`/v1/owner/organizations/${pageData.orgId}/invites/${inviteId}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                olToast(olApiError(err, "Failed to cancel invite"), "error");
                btn.disabled = false;
                btn.textContent = "Cancel";
                return;
            }
            olToast("Invitation cancelled", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch {
            olToast("Network error", "error");
            btn.disabled = false;
            btn.textContent = "Cancel";
        }
    });
});

// ─── Rename organization ──────────────────────────────────────────────

const btnRename = document.getElementById("btn-rename-org");
const renameForm = document.getElementById("rename-form");
const renameInput = document.getElementById("rename-input") as HTMLInputElement | null;
const btnSaveRename = document.getElementById("btn-save-rename") as HTMLButtonElement | null;
const btnCancelRename = document.getElementById("btn-cancel-rename");
const orgDisplayName = document.getElementById("org-display-name");

btnRename?.addEventListener("click", () => {
    renameForm?.classList.remove("hidden");
    btnRename.classList.add("hidden");
    renameInput?.focus();
    renameInput?.select();
});

btnCancelRename?.addEventListener("click", () => {
    renameForm?.classList.add("hidden");
    btnRename?.classList.remove("hidden");
});

btnSaveRename?.addEventListener("click", async () => {
    const newName = renameInput?.value.trim();
    if (!newName) return;

    btnSaveRename.disabled = true;
    try {
        const res = await fetch(`/v1/owner/organizations/${pageData.orgId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: newName }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            olToast(olApiError(err, "Failed to rename"), "error");
            return;
        }
        if (orgDisplayName) orgDisplayName.textContent = newName;
        renameForm?.classList.add("hidden");
        btnRename?.classList.remove("hidden");
        olToast("Organization renamed", "success");
    } catch {
        olToast("Network error", "error");
    } finally {
        btnSaveRename.disabled = false;
    }
});

// ─── Edit slug (org settings, distinct from the create-form slug input above) ─

const slugDisplay = document.getElementById("slug-display");
const slugForm = document.getElementById("slug-form") as HTMLFormElement | null;
const editSlugInput = document.getElementById("slug-input") as HTMLInputElement | null;
const btnEditSlug = document.getElementById("btn-edit-slug");
const btnCancelSlug = document.getElementById("btn-cancel-slug");

btnEditSlug?.addEventListener("click", () => {
    slugDisplay?.classList.add("hidden");
    slugForm?.classList.remove("hidden");
    editSlugInput?.focus();
    editSlugInput?.select();
});

btnCancelSlug?.addEventListener("click", () => {
    slugForm?.classList.add("hidden");
    slugDisplay?.classList.remove("hidden");
    olClearFieldErrors("slug-form");
});

slugForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    olClearFieldErrors("slug-form");
    const next = editSlugInput?.value.trim().toLowerCase();
    if (!next) {
        olFieldError("slug-input", "Slug is required");
        return;
    }

    const submitBtn = slugForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
        const res = await fetch(`/v1/owner/organizations/${pageData.orgId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: next }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            // Surface validation/uniqueness errors on the input; fall back to toast.
            if (res.status === 400 || res.status === 409) {
                olFieldError("slug-input", olApiError(err, "Invalid slug"));
            } else {
                olToast(olApiError(err, "Failed to update slug"), "error");
            }
            return;
        }
        // Reload so the URL, sidebar switcher label, and slug history all
        // reflect the new state in one shot.
        olToast("Slug updated", "success");
        window.location.reload();
    } catch {
        olToast("Network error", "error");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});

// ─── Contact identities management ───────────────────────────────────

const btnAddContact = document.getElementById("btn-add-contact");
const contactForm = document.getElementById("add-contact-form");
const btnSubmitContact = document.getElementById("btn-submit-contact") as HTMLButtonElement | null;
const btnCancelContact = document.getElementById("btn-cancel-contact");
const contactTypeSelect = document.getElementById("contact-type") as HTMLSelectElement | null;
const contactValueInput = document.getElementById("contact-value") as HTMLInputElement | null;

btnAddContact?.addEventListener("click", () => {
    contactForm?.classList.remove("hidden");
    btnAddContact.classList.add("hidden");
    contactValueInput?.focus();
});

btnCancelContact?.addEventListener("click", () => {
    contactForm?.classList.add("hidden");
    btnAddContact?.classList.remove("hidden");
    olClearFieldErrors("add-contact-form");
    if (contactValueInput) contactValueInput.value = "";
});

async function saveContactIdentities(contacts: ContactIdentityEntry[]) {
    const res = await fetch(`/v1/owner/organizations/${pageData.orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_identities: contacts }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(olApiError(err, "Failed to update contacts"));
    }
}

btnSubmitContact?.addEventListener("click", async () => {
    olClearFieldErrors("add-contact-form");
    const contactType = contactTypeSelect?.value || "EMAIL";
    const contactValue = contactValueInput?.value.trim();
    if (!contactValue) {
        olFieldError("contact-value", "Value is required");
        return;
    }

    btnSubmitContact.disabled = true;
    btnSubmitContact.textContent = "Adding\u2026";

    try {
        const existing = [...(pageData.contactIdentities ?? [])];
        existing.push({
            contact_id: crypto.randomUUID(),
            type: contactType,
            value: contactValue,
            verified: false,
        });
        await saveContactIdentities(existing);
        olToast("Contact added", "success");
        setTimeout(() => { window.location.reload(); }, 800);
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    } finally {
        btnSubmitContact.disabled = false;
        btnSubmitContact.textContent = "Add";
    }
});

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-remove-contact").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (!(await olConfirm("Remove this contact?", "Remove"))) return;

        btn.disabled = true;
        try {
            const existing = [...(pageData.contactIdentities ?? [])];
            existing.splice(idx, 1);
            await saveContactIdentities(existing);
            olToast("Contact removed", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch (err: unknown) {
            olToast(String((err as Error).message || err), "error");
            btn.disabled = false;
        }
    });
});

// ─── Domains management ─────────────────────────────────────────────

const btnAddDomain = document.getElementById("btn-add-domain");
const domainForm = document.getElementById("add-domain-form");
const btnSubmitDomain = document.getElementById("btn-submit-domain") as HTMLButtonElement | null;
const btnCancelDomain = document.getElementById("btn-cancel-domain");
const domainValueInput = document.getElementById("domain-value") as HTMLInputElement | null;

btnAddDomain?.addEventListener("click", () => {
    domainForm?.classList.remove("hidden");
    btnAddDomain.classList.add("hidden");
    domainValueInput?.focus();
});

btnCancelDomain?.addEventListener("click", () => {
    domainForm?.classList.add("hidden");
    btnAddDomain?.classList.remove("hidden");
    olClearFieldErrors("add-domain-form");
    if (domainValueInput) domainValueInput.value = "";
});

async function saveDomains(domains: DomainEntry[]) {
    const res = await fetch(`/v1/owner/organizations/${pageData.orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(olApiError(err, "Failed to update domains"));
    }
}

btnSubmitDomain?.addEventListener("click", async () => {
    olClearFieldErrors("add-domain-form");
    const domainValue = domainValueInput?.value.trim().toLowerCase();
    if (!domainValue) {
        olFieldError("domain-value", "Domain name is required");
        return;
    }

    btnSubmitDomain.disabled = true;
    btnSubmitDomain.textContent = "Adding\u2026";

    try {
        const existing = [...(pageData.domains ?? [])];
        existing.push({
            domain_id: crypto.randomUUID(),
            domain: domainValue,
            verification_level: "UNVERIFIED",
            verified_at: null,
            added_at: new Date().toISOString(),
        });
        await saveDomains(existing);
        olToast("Domain added", "success");
        setTimeout(() => { window.location.reload(); }, 800);
    } catch (err: unknown) {
        olToast(String((err as Error).message || err), "error");
    } finally {
        btnSubmitDomain.disabled = false;
        btnSubmitDomain.textContent = "Add";
    }
});

document.querySelectorAll<HTMLButtonElement>(".oorg-btn-remove-domain").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.index!, 10);
        if (!(await olConfirm("Remove this domain?", "Remove"))) return;

        btn.disabled = true;
        try {
            const existing = [...(pageData.domains ?? [])];
            existing.splice(idx, 1);
            await saveDomains(existing);
            olToast("Domain removed", "success");
            setTimeout(() => { window.location.reload(); }, 800);
        } catch (err: unknown) {
            olToast(String((err as Error).message || err), "error");
            btn.disabled = false;
        }
    });
});
