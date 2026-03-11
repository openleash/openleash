/**
 * Client-side logic for the owner profile page.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface ContactIdentity {
    contact_id?: string;
    type: string;
    value: string;
    label?: string;
    platform?: string;
    verified: boolean;
    verified_at: string | null;
    added_at: string;
}

interface GovId {
    country: string;
    id_type: string;
    id_value: string;
    verification_level: string;
    verified_at: string | null;
    added_at: string;
}

interface CompanyId {
    id_type: string;
    country?: string;
    id_value: string;
    verification_level: string;
    verified_at: string | null;
    added_at: string;
}

interface OwnerProfilePageData {
    contacts: ContactIdentity[];
    govIds: GovId[];
    companyIds: CompanyId[];
    idTypesMap: Record<string, string[]>;
    idLabelsMap: Record<string, string>;
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerProfilePageData;
        showNameEdit: () => void;
        hideNameEdit: () => void;
        updateName: () => Promise<void>;
        addContact: () => Promise<void>;
        removeContact: (idx: number) => Promise<void>;
        updateIdTypes: () => void;
        addGovId: () => Promise<void>;
        removeGovId: (idx: number) => Promise<void>;
        addCompanyId: () => Promise<void>;
        removeCompanyId: (idx: number) => Promise<void>;
        openModal: (id: string) => void;
        closeModal: (id: string) => void;
        downloadBackupCodes: () => void;
        setupTotp: () => Promise<void>;
        confirmTotp: () => Promise<void>;
        openDisableModal: () => void;
        confirmDisableTotp: () => Promise<void>;
    }
}

// ─── Page data ──────────────────────────────────────────────────────

const { contacts, govIds, companyIds, idTypesMap, idLabelsMap } = window.__PAGE_DATA__;
const token = sessionStorage.getItem("openleash_session");

// ─── Helpers ────────────────────────────────────────────────────────

async function saveProfile(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/v1/owner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.olToast(window.olApiError(data, "Update failed"), "error");
        return false;
    }
    return true;
}

// ─── Display name ───────────────────────────────────────────────────

window.showNameEdit = function () {
    document.getElementById("display-name-view")!.style.display = "none";
    document.getElementById("display-name-edit")!.style.display = "flex";
    (document.getElementById("newDisplayName") as HTMLInputElement).focus();
};

window.hideNameEdit = function () {
    document.getElementById("display-name-edit")!.style.display = "none";
    document.getElementById("display-name-view")!.style.display = "flex";
};

window.updateName = async function () {
    const name = (document.getElementById("newDisplayName") as HTMLInputElement).value.trim();
    window.olFieldError("newDisplayName", "");
    if (!name) {
        window.olFieldError("newDisplayName", "Name cannot be empty");
        return;
    }
    if (await saveProfile({ display_name: name })) window.location.reload();
};

// ─── Contact identities ────────────────────────────────────────────

window.addContact = async function () {
    const type = (document.getElementById("contact-type") as HTMLSelectElement).value;
    const value = (document.getElementById("contact-value") as HTMLInputElement).value.trim();
    const label = (document.getElementById("contact-label") as HTMLInputElement).value.trim();
    const platform = (document.getElementById("contact-platform") as HTMLInputElement).value.trim();
    window.olFieldError("contact-value", "");
    if (!value) {
        window.olFieldError("contact-value", "Value is required");
        return;
    }
    const entry: Record<string, unknown> = {
        type, value, added_at: new Date().toISOString(), verified: false, verified_at: null,
    };
    if (label) entry.label = label;
    if (platform) entry.platform = platform;
    const updated = contacts.concat([entry as unknown as ContactIdentity]);
    if (await saveProfile({ contact_identities: updated })) window.location.reload();
};

window.removeContact = async function (idx: number) {
    const updated = contacts.filter((_, i) => i !== idx);
    if (await saveProfile({ contact_identities: updated })) window.location.reload();
};

// ─── Government IDs ─────────────────────────────────────────────────

window.updateIdTypes = function () {
    const country = (document.getElementById("gov-country") as HTMLSelectElement).value;
    const sel = document.getElementById("gov-id-type") as HTMLSelectElement;
    sel.innerHTML = "";
    if (!country || !idTypesMap[country]) {
        sel.innerHTML = '<option value="">Select country first</option>';
        return;
    }
    idTypesMap[country].forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = idLabelsMap[t] || t;
        sel.appendChild(opt);
    });
};

window.addGovId = async function () {
    const country = (document.getElementById("gov-country") as HTMLSelectElement).value;
    const idType = (document.getElementById("gov-id-type") as HTMLSelectElement).value;
    const idValue = (document.getElementById("gov-id-value") as HTMLInputElement).value.trim();
    window.olFieldError("gov-country", "");
    window.olFieldError("gov-id-type", "");
    window.olFieldError("gov-id-value", "");
    let valid = true;
    if (!country) { window.olFieldError("gov-country", "Country is required"); valid = false; }
    if (!idType) { window.olFieldError("gov-id-type", "ID type is required"); valid = false; }
    if (!idValue) { window.olFieldError("gov-id-value", "ID value is required"); valid = false; }
    if (!valid) return;
    const entry: GovId = {
        country, id_type: idType, id_value: idValue,
        verification_level: "UNVERIFIED", verified_at: null, added_at: new Date().toISOString(),
    };
    const updated = govIds.concat([entry]);
    if (await saveProfile({ government_ids: updated })) window.location.reload();
};

window.removeGovId = async function (idx: number) {
    const updated = govIds.filter((_, i) => i !== idx);
    if (await saveProfile({ government_ids: updated })) window.location.reload();
};

// ─── Company IDs ────────────────────────────────────────────────────

window.addCompanyId = async function () {
    const idType = (document.getElementById("company-id-type") as HTMLSelectElement).value;
    const country = (document.getElementById("company-country") as HTMLSelectElement).value;
    const idValue = (document.getElementById("company-id-value") as HTMLInputElement).value.trim();
    window.olFieldError("company-id-value", "");
    if (!idValue) {
        window.olFieldError("company-id-value", "ID value is required");
        return;
    }
    const entry: Record<string, unknown> = {
        id_type: idType, id_value: idValue,
        verification_level: "UNVERIFIED", verified_at: null, added_at: new Date().toISOString(),
    };
    if (country) entry.country = country;
    const updated = companyIds.concat([entry as unknown as CompanyId]);
    if (await saveProfile({ company_ids: updated })) window.location.reload();
};

window.removeCompanyId = async function (idx: number) {
    const updated = companyIds.filter((_, i) => i !== idx);
    if (await saveProfile({ company_ids: updated })) window.location.reload();
};

// ─── Modals ─────────────────────────────────────────────────────────

window.openModal = function (id: string) {
    document.getElementById(id)!.classList.add("open");
};

window.closeModal = function (id: string) {
    document.getElementById(id)!.classList.remove("open");
};

// ─── TOTP setup ─────────────────────────────────────────────────────

window.downloadBackupCodes = function () {
    const codes = document.getElementById("totp-backup-codes")!.innerText;
    const blob = new Blob([codes], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "openleash-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
};

window.setupTotp = async function () {
    const res = await fetch("/v1/owner/totp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: "{}",
    });
    if (!res.ok) {
        window.olToast("Failed to start TOTP setup", "error");
        return;
    }
    const data = await res.json();
    document.getElementById("totp-qr")!.innerHTML = data.qr_svg;
    document.getElementById("totp-secret-display")!.textContent = data.secret;
    document.getElementById("totp-backup-codes")!.innerHTML = data.backup_codes.join("<br>");
    (document.getElementById("totp-confirm-code") as HTMLInputElement).value = "";
    document.getElementById("totp-setup-error")!.textContent = "";
    window.openModal("totp-setup-modal");
};

window.confirmTotp = async function () {
    const code = (document.getElementById("totp-confirm-code") as HTMLInputElement).value.trim();
    const errEl = document.getElementById("totp-setup-error")!;
    if (!code) {
        errEl.textContent = "Enter a 6-digit code";
        return;
    }
    const res = await fetch("/v1/owner/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ code }),
    });
    if (res.ok) {
        window.location.reload();
    } else {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = window.olApiError(data, "Invalid code");
    }
};

window.openDisableModal = function () {
    (document.getElementById("totp-disable-code") as HTMLInputElement).value = "";
    document.getElementById("totp-disable-error")!.textContent = "";
    window.openModal("totp-disable-modal");
};

window.confirmDisableTotp = async function () {
    const code = (document.getElementById("totp-disable-code") as HTMLInputElement).value.trim();
    const errEl = document.getElementById("totp-disable-error")!;
    if (!code) {
        errEl.textContent = "Enter a code";
        return;
    }
    const res = await fetch("/v1/owner/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ code }),
    });
    if (res.ok) {
        window.location.reload();
    } else {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = window.olApiError(data, "Invalid code");
    }
};
