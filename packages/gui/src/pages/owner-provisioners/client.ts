import "./style.css";
import { olToast, olApiError, olFieldError, olConfirm } from "../../shared/common";

// ─── Create panel visibility ────────────────────────────────────────
const createPanel = document.getElementById("create-panel");
const tokenPanel = document.getElementById("token-panel");
const tokenValue = document.getElementById("token-value");
const showBtn = document.getElementById("btn-show-create");
const cancelBtn = document.getElementById("btn-create-cancel");
const createBtn = document.getElementById("btn-create") as HTMLButtonElement | null;
const copyBtn = document.getElementById("btn-copy-token");
const nameInput = document.getElementById("prov-name") as HTMLInputElement | null;

showBtn?.addEventListener("click", () => {
    createPanel?.classList.remove("hidden");
    nameInput?.focus();
});
cancelBtn?.addEventListener("click", () => {
    createPanel?.classList.add("hidden");
    if (nameInput) nameInput.value = "";
    olFieldError("prov-name", "");
});

// ─── Create submit ──────────────────────────────────────────────────
createBtn?.addEventListener("click", async () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name) {
        olFieldError("prov-name", "Name is required");
        return;
    }

    createBtn.disabled = true;
    const res = await fetch("/v1/owner/provisioners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });

    if (res.ok) {
        const body = (await res.json()) as { token: string };
        createPanel?.classList.add("hidden");
        if (tokenValue) tokenValue.textContent = body.token;
        tokenPanel?.classList.remove("hidden");
        olToast("Provisioner created — copy the token now", "success");
    } else {
        const data = await res.json().catch(() => ({}));
        olToast(olApiError(data, "Create failed"), "error");
    }
    createBtn.disabled = false;
});

copyBtn?.addEventListener("click", async () => {
    const token = tokenValue?.textContent ?? "";
    if (!token) return;
    await navigator.clipboard.writeText(token);
    olToast("Token copied to clipboard", "success");
});

// ─── Revoke ─────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>(".oprov-revoke").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const name = btn.dataset.name ?? "this provisioner";
        const confirmed = await olConfirm(
            `Revoke "${name}"? Its token stops working immediately; agents it already enrolled keep running.`,
            "Revoke provisioner",
        );
        if (!confirmed) return;

        btn.disabled = true;
        const res = await fetch(`/v1/owner/provisioners/${encodeURIComponent(btn.dataset.id ?? "")}`, {
            method: "DELETE",
        });
        if (res.ok) {
            olToast("Provisioner revoked", "success");
            window.location.reload();
        } else {
            const data = await res.json().catch(() => ({}));
            olToast(olApiError(data, "Revoke failed"), "error");
            btn.disabled = false;
        }
    });
});
