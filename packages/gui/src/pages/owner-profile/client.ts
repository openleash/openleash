/**
 * Client-side logic for the owner profile page.
 */
import "./style.css";
import { olToast, olFieldError, olApiError } from "../../shared/common";

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
    verificationProviders: string[];
}

declare global {
    interface Window {
        __PAGE_DATA__: OwnerProfilePageData;
    }
}

// ─── Page data ──────────────────────────────────────────────────────

const { contacts, govIds, companyIds, idTypesMap, idLabelsMap, verificationProviders } = window.__PAGE_DATA__;

// ─── Helpers ────────────────────────────────────────────────────────

async function saveProfile(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/v1/owner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        olToast(olApiError(data, "Update failed"), "error");
        return false;
    }
    return true;
}

// ─── Display name ───────────────────────────────────────────────────

function showNameEdit() {
    document.getElementById("display-name-view")!.style.display = "none";
    document.getElementById("display-name-edit")!.style.display = "flex";
    (document.getElementById("new-display-name") as HTMLInputElement).focus();
}

function hideNameEdit() {
    document.getElementById("display-name-edit")!.style.display = "none";
    document.getElementById("display-name-view")!.style.display = "flex";
}

async function updateName() {
    const name = (document.getElementById("new-display-name") as HTMLInputElement).value.trim();
    olFieldError("new-display-name", "");
    if (!name) {
        olFieldError("new-display-name", "Name cannot be empty");
        return;
    }
    if (await saveProfile({ display_name: name })) window.location.reload();
}

// ─── Contact identities ────────────────────────────────────────────

async function addContact() {
    const type = (document.getElementById("contact-type") as HTMLSelectElement).value;
    const value = (document.getElementById("contact-value") as HTMLInputElement).value.trim();
    const label = (document.getElementById("contact-label") as HTMLInputElement).value.trim();
    const platform = (document.getElementById("contact-platform") as HTMLInputElement).value.trim();
    olFieldError("contact-value", "");
    if (!value) {
        olFieldError("contact-value", "Value is required");
        return;
    }
    const entry: Record<string, unknown> = {
        type, value, added_at: new Date().toISOString(), verified: false, verified_at: null,
    };
    if (label) entry.label = label;
    if (platform) entry.platform = platform;
    const updated = contacts.concat([entry as unknown as ContactIdentity]);
    if (await saveProfile({ contact_identities: updated })) window.location.reload();
}

async function removeContact(idx: number) {
    const updated = contacts.filter((_, i) => i !== idx);
    if (await saveProfile({ contact_identities: updated })) window.location.reload();
}

// ─── Government IDs ─────────────────────────────────────────────────

function updateIdTypes() {
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
}

async function addGovId() {
    const country = (document.getElementById("gov-country") as HTMLSelectElement).value;
    const idType = (document.getElementById("gov-id-type") as HTMLSelectElement).value;
    const idValue = (document.getElementById("gov-id-value") as HTMLInputElement).value.trim();
    olFieldError("gov-country", "");
    olFieldError("gov-id-type", "");
    olFieldError("gov-id-value", "");
    let valid = true;
    if (!country) { olFieldError("gov-country", "Country is required"); valid = false; }
    if (!idType) { olFieldError("gov-id-type", "ID type is required"); valid = false; }
    if (!idValue) { olFieldError("gov-id-value", "ID value is required"); valid = false; }
    if (!valid) return;
    const entry: GovId = {
        country, id_type: idType, id_value: idValue,
        verification_level: "UNVERIFIED", verified_at: null, added_at: new Date().toISOString(),
    };
    const updated = govIds.concat([entry]);
    if (await saveProfile({ government_ids: updated })) window.location.reload();
}

async function removeGovId(idx: number) {
    const updated = govIds.filter((_, i) => i !== idx);
    if (await saveProfile({ government_ids: updated })) window.location.reload();
}

// ─── Company IDs ────────────────────────────────────────────────────

async function addCompanyId() {
    const idType = (document.getElementById("company-id-type") as HTMLSelectElement).value;
    const country = (document.getElementById("company-country") as HTMLSelectElement).value;
    const idValue = (document.getElementById("company-id-value") as HTMLInputElement).value.trim();
    olFieldError("company-id-value", "");
    if (!idValue) {
        olFieldError("company-id-value", "ID value is required");
        return;
    }
    const entry: Record<string, unknown> = {
        id_type: idType, id_value: idValue,
        verification_level: "UNVERIFIED", verified_at: null, added_at: new Date().toISOString(),
    };
    if (country) entry.country = country;
    const updated = companyIds.concat([entry as unknown as CompanyId]);
    if (await saveProfile({ company_ids: updated })) window.location.reload();
}

async function removeCompanyId(idx: number) {
    const updated = companyIds.filter((_, i) => i !== idx);
    if (await saveProfile({ company_ids: updated })) window.location.reload();
}

// ─── Modals ─────────────────────────────────────────────────────────

function openModal(id: string) {
    document.getElementById(id)!.classList.add("open");
}

function closeModal(id: string) {
    document.getElementById(id)!.classList.remove("open");
}

// ─── TOTP setup ─────────────────────────────────────────────────────

function downloadBackupCodes() {
    const codes = document.getElementById("totp-backup-codes")!.innerText;
    const blob = new Blob([codes], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "openleash-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
}

async function setupTotp() {
    const res = await fetch("/v1/owner/totp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
    });
    if (!res.ok) {
        olToast("Failed to start TOTP setup", "error");
        return;
    }
    const data = await res.json();
    document.getElementById("totp-qr")!.innerHTML = data.qr_svg;
    document.getElementById("totp-secret-display")!.textContent = data.secret;
    document.getElementById("totp-backup-codes")!.innerHTML = data.backup_codes.join("<br>");
    (document.getElementById("totp-confirm-code") as HTMLInputElement).value = "";
    document.getElementById("totp-setup-error")!.textContent = "";
    openModal("totp-setup-modal");
}

async function confirmTotp() {
    const code = (document.getElementById("totp-confirm-code") as HTMLInputElement).value.trim();
    const errEl = document.getElementById("totp-setup-error")!;
    if (!code) {
        errEl.textContent = "Enter a 6-digit code";
        return;
    }
    const res = await fetch("/v1/owner/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });
    if (res.ok) {
        window.location.reload();
    } else {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = olApiError(data, "Invalid code");
    }
}

function openDisableModal() {
    (document.getElementById("totp-disable-code") as HTMLInputElement).value = "";
    document.getElementById("totp-disable-error")!.textContent = "";
    openModal("totp-disable-modal");
}

async function confirmDisableTotp() {
    const code = (document.getElementById("totp-disable-code") as HTMLInputElement).value.trim();
    const errEl = document.getElementById("totp-disable-error")!;
    if (!code) {
        errEl.textContent = "Enter a code";
        return;
    }
    const res = await fetch("/v1/owner/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });
    if (res.ok) {
        window.location.reload();
    } else {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = olApiError(data, "Invalid code");
    }
}

// ─── Identity verification ──────────────────────────────────────────

let bankidPollTimer: ReturnType<typeof setInterval> | null = null;
let bankidOrderRef: string | null = null;

async function startBankIdVerification(govIdIndex: number) {
    openModal("bankid-modal");
    document.getElementById("bankid-step-init")!.classList.remove("hidden");
    document.getElementById("bankid-step-error")!.classList.add("hidden");
    document.getElementById("bankid-status-text")!.textContent = "Waiting for BankID...";
    document.getElementById("bankid-qr")!.innerHTML = "";

    const res = await fetch("/verification/bankid/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gov_id_index: govIdIndex }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showBankIdError(olApiError(data, "Failed to start BankID verification"));
        return;
    }
    const data = await res.json();
    bankidOrderRef = data.order_ref;
    if (data.qr_data) {
        document.getElementById("bankid-qr")!.innerHTML = `<img src="${data.qr_data}" alt="BankID QR code">`;
    }

    bankidPollTimer = setInterval(() => pollBankId(), 2000);
}

async function pollBankId() {
    if (!bankidOrderRef) return;
    const res = await fetch(`/verification/bankid/status/${bankidOrderRef}`);
    if (!res.ok) {
        stopBankIdPoll();
        showBankIdError("Failed to check BankID status");
        return;
    }
    const data = await res.json();
    if (data.status === "complete") {
        stopBankIdPoll();
        olToast("Identity verified with BankID", "success");
        window.location.reload();
    } else if (data.status === "failed") {
        stopBankIdPoll();
        showBankIdError(data.hint_code || "BankID verification failed");
    } else {
        document.getElementById("bankid-status-text")!.textContent = data.hint_code || "Waiting for BankID...";
        if (data.qr_data) {
            document.getElementById("bankid-qr")!.innerHTML = `<img src="${data.qr_data}" alt="BankID QR code">`;
        }
    }
}

function stopBankIdPoll() {
    if (bankidPollTimer) {
        clearInterval(bankidPollTimer);
        bankidPollTimer = null;
    }
    bankidOrderRef = null;
}

function cancelBankId() {
    if (bankidOrderRef) {
        fetch(`/verification/bankid/cancel/${bankidOrderRef}`, { method: "POST" }).catch(() => {});
    }
    stopBankIdPoll();
    closeModal("bankid-modal");
}

function showBankIdError(msg: string) {
    document.getElementById("bankid-step-init")!.classList.add("hidden");
    document.getElementById("bankid-step-error")!.classList.remove("hidden");
    document.getElementById("bankid-error-text")!.textContent = msg;
}

let otpProvider: string | null = null;
let _otpContactIndex: number | null = null;
let otpOrderRef: string | null = null;

async function startOtpVerification(contactIndex: number, provider: string) {
    otpProvider = provider;
    _otpContactIndex = contactIndex;

    const label = provider === "sms-otp" ? "SMS" : "Email";
    document.getElementById("otp-modal-title")!.textContent = `Verify via ${label}`;
    document.getElementById("otp-modal-desc")!.textContent = `A verification code will be sent to your ${label.toLowerCase()}.`;
    (document.getElementById("otp-code") as HTMLInputElement).value = "";
    document.getElementById("otp-error")!.textContent = "";
    openModal("otp-modal");

    const endpoint = provider === "sms-otp" ? "/verification/sms/initiate" : "/verification/email/initiate";
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_index: contactIndex }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        document.getElementById("otp-error")!.textContent = olApiError(data, "Failed to send code");
        return;
    }
    const data = await res.json();
    otpOrderRef = data.order_ref;
    document.getElementById("otp-modal-desc")!.textContent = `A verification code has been sent. Enter the 6-digit code below.`;
}

async function verifyOtp() {
    const code = (document.getElementById("otp-code") as HTMLInputElement).value.trim();
    const errEl = document.getElementById("otp-error")!;
    if (!code) {
        errEl.textContent = "Enter the verification code";
        return;
    }
    if (!otpProvider || !otpOrderRef) {
        errEl.textContent = "No verification in progress";
        return;
    }
    const endpoint = otpProvider === "sms-otp" ? "/verification/sms/verify" : "/verification/email/verify";
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ref: otpOrderRef, code }),
    });
    if (res.ok) {
        olToast("Contact verified", "success");
        window.location.reload();
    } else {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = olApiError(data, "Invalid code");
    }
}

async function startBolagsverketVerification(companyIdIndex: number) {
    const res = await fetch("/verification/bolagsverket/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id_index: companyIdIndex }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        olToast(olApiError(data, "Verification failed"), "error");
        return;
    }
    olToast("Company verified via Bolagsverket", "success");
    window.location.reload();
}

// Suppress unused variable warning
void verificationProviders;

// ─── Event bindings ─────────────────────────────────────────────────

document.getElementById("btn-show-name-edit")?.addEventListener("click", showNameEdit);
document.getElementById("btn-hide-name-edit")?.addEventListener("click", hideNameEdit);
document.getElementById("btn-update-name")?.addEventListener("click", updateName);
document.getElementById("btn-add-contact")?.addEventListener("click", addContact);
document.getElementById("btn-add-gov-id")?.addEventListener("click", addGovId);
document.getElementById("btn-add-company-id")?.addEventListener("click", addCompanyId);
document.getElementById("btn-setup-totp")?.addEventListener("click", setupTotp);
document.getElementById("btn-download-codes")?.addEventListener("click", downloadBackupCodes);
document.getElementById("btn-confirm-totp")?.addEventListener("click", confirmTotp);
document.getElementById("btn-open-disable-modal")?.addEventListener("click", openDisableModal);
document.getElementById("btn-confirm-disable-totp")?.addEventListener("click", confirmDisableTotp);
document.getElementById("btn-bankid-cancel")?.addEventListener("click", cancelBankId);
document.getElementById("btn-otp-verify")?.addEventListener("click", verifyOtp);

document.getElementById("gov-country")?.addEventListener("change", updateIdTypes);

// Close modal buttons and overlay clicks
document.querySelectorAll<HTMLElement>("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", (e) => {
        if (el.classList.contains("modal-overlay") && e.target !== e.currentTarget) return;
        closeModal(el.getAttribute("data-close-modal")!);
    });
});

// Dynamic action buttons (remove contact/govId/companyId)
document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    switch (btn.dataset.action) {
        case "remove-contact": removeContact(idx); break;
        case "remove-gov-id": removeGovId(idx); break;
        case "remove-company-id": removeCompanyId(idx); break;
        case "verify-contact": startOtpVerification(idx, btn.dataset.provider!); break;
        case "verify-gov-id": startBankIdVerification(idx); break;
        case "verify-company-id": startBolagsverketVerification(idx); break;
    }
});
