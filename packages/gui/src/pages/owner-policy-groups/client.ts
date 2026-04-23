import "./style.css";
import { olToast, olApiError, olFieldError } from "../../shared/common";

interface PageData {
    orgId: string;
    orgSlug: string;
    canManage: boolean;
}

const pageData = (window as unknown as { __PAGE_DATA__: PageData }).__PAGE_DATA__;

// ─── Create panel visibility ────────────────────────────────────────
const createPanel = document.getElementById("create-group-panel");
const showBtn = document.getElementById("btn-show-create");
const cancelBtn = document.getElementById("btn-grp-cancel");
const createBtn = document.getElementById("btn-grp-create");
const nameInput = document.getElementById("grp-name") as HTMLInputElement | null;
const slugInput = document.getElementById("grp-slug") as HTMLInputElement | null;
const descInput = document.getElementById("grp-description") as HTMLInputElement | null;

function showCreate() {
    createPanel?.classList.remove("hidden");
    nameInput?.focus();
}
function hideCreate() {
    createPanel?.classList.add("hidden");
    if (nameInput) nameInput.value = "";
    if (slugInput) slugInput.value = "";
    if (descInput) descInput.value = "";
    olFieldError("grp-name", "");
    olFieldError("grp-slug", "");
}

showBtn?.addEventListener("click", showCreate);
cancelBtn?.addEventListener("click", hideCreate);

// ─── Create submit ──────────────────────────────────────────────────
createBtn?.addEventListener("click", async () => {
    const name = nameInput?.value.trim() ?? "";
    const slug = slugInput?.value.trim() ?? "";
    const description = descInput?.value.trim() ?? "";

    if (!name) {
        olFieldError("grp-name", "Name is required");
        return;
    }

    (createBtn as HTMLButtonElement).disabled = true;
    const payload: Record<string, string> = { name };
    if (slug) payload.slug = slug;
    if (description) payload.description = description;

    const res = await fetch(
        `/v1/owner/organizations/${encodeURIComponent(pageData.orgId)}/policy-groups`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );

    if (res.ok) {
        const body = (await res.json()) as { slug: string };
        olToast("Policy group created", "success");
        window.location.href = `/gui/orgs/${encodeURIComponent(pageData.orgSlug)}/policy-groups/${encodeURIComponent(body.slug)}`;
        return;
    }

    const data = await res.json().catch(() => ({}));
    const msg = olApiError(data, "Create failed");
    // Surface SLUG_TAKEN inline; fall back to toast for generic errors.
    const errCode = (data as { error?: { code?: string } })?.error?.code;
    if (errCode === "SLUG_TAKEN" || errCode === "INVALID_SLUG") {
        olFieldError("grp-slug", msg);
    } else if (errCode === "INVALID_BODY") {
        olFieldError("grp-name", msg);
    } else {
        olToast(msg, "error");
    }
    (createBtn as HTMLButtonElement).disabled = false;
});
