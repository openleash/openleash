import "./style.css";
import { olToast, olApiError, olFieldError, olConfirm } from "../../shared/common";

const apiBase = document.getElementById("oak-root")?.dataset.apiBase ?? "/v1/owner";

// Show the export URL with this server's origin so it can be pasted as-is.
const snippet = document.getElementById("oak-snippet");
if (snippet?.dataset.path) {
    const path = snippet.dataset.path;
    snippet.textContent = (snippet.textContent ?? "").replace(path, window.location.origin + path);
}

// ─── Create panel visibility ────────────────────────────────────────
const createPanel = document.getElementById("create-panel");
const tokenPanel = document.getElementById("token-panel");
const tokenValue = document.getElementById("token-value");
const showBtn = document.getElementById("btn-show-create");
const cancelBtn = document.getElementById("btn-create-cancel");
const createBtn = document.getElementById("btn-create") as HTMLButtonElement | null;
const copyBtn = document.getElementById("btn-copy-token");
const nameInput = document.getElementById("key-name") as HTMLInputElement | null;

showBtn?.addEventListener("click", () => {
    createPanel?.classList.remove("hidden");
    nameInput?.focus();
});
cancelBtn?.addEventListener("click", () => {
    createPanel?.classList.add("hidden");
    if (nameInput) nameInput.value = "";
    olFieldError("key-name", "");
});

// ─── Create submit ──────────────────────────────────────────────────
createBtn?.addEventListener("click", async () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name) {
        olFieldError("key-name", "Name is required");
        return;
    }

    createBtn.disabled = true;
    const res = await fetch(`${apiBase}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: ["audit:read"] }),
    });

    if (res.ok) {
        const body = (await res.json()) as { token: string };
        createPanel?.classList.add("hidden");
        if (tokenValue) tokenValue.textContent = body.token;
        tokenPanel?.classList.remove("hidden");
        olToast("API key created — copy it now", "success");
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
    olToast("API key copied to clipboard", "success");
});

// ─── Revoke ─────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>(".oak-revoke").forEach((btn) => {
    btn.addEventListener("click", async () => {
        const name = btn.dataset.name ?? "this key";
        const confirmed = await olConfirm(
            `Revoke "${name}"? Integrations using it stop receiving audit events immediately.`,
            "Revoke API key",
        );
        if (!confirmed) return;

        btn.disabled = true;
        const res = await fetch(`${apiBase}/api-keys/${encodeURIComponent(btn.dataset.id ?? "")}`, {
            method: "DELETE",
        });
        if (res.ok) {
            olToast("API key revoked", "success");
            window.location.reload();
        } else {
            const data = await res.json().catch(() => ({}));
            olToast(olApiError(data, "Revoke failed"), "error");
            btn.disabled = false;
        }
    });
});
