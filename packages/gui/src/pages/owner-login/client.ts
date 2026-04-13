/**
 * Client-side logic for the owner login page.
 */
import "../../shared/styles/auth.css";

const REMEMBER_KEY = 'ol_remember_me';

function isRemembered(): boolean {
    return localStorage.getItem(REMEMBER_KEY) !== 'false';
}

// Pre-fill owner ID from URL params
(function () {
    const p = new URLSearchParams(window.location.search);
    const oid = p.get("owner_id");
    if (oid) (document.getElementById("owner-id") as HTMLInputElement).value = oid;
})();

// Init remember me checkbox
const rememberCheckbox = document.getElementById("login-remember") as HTMLInputElement | null;
if (rememberCheckbox) {
    rememberCheckbox.checked = isRemembered();
    rememberCheckbox.addEventListener("change", () => {
        localStorage.setItem(REMEMBER_KEY, String(rememberCheckbox.checked));
    });
}

document.getElementById("login-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("error-msg") as HTMLElement;
    errorEl.style.display = "none";

    const ownerId = (document.getElementById("owner-id") as HTMLInputElement).value.trim();
    const passphrase = (document.getElementById("passphrase") as HTMLInputElement).value;

    try {
        const res = await fetch("/v1/owner/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_principal_id: ownerId, passphrase }),
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data?.error?.message || "Login failed";
            errorEl.style.display = "block";
            return;
        }

        const maxAge = isRemembered() ? "; Max-Age=2592000" : "";
        document.cookie = "openleash_session=" + data.token + "; path=/; SameSite=Strict" + maxAge;
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get("redirect");
        window.location.href = redirect && redirect.startsWith("/gui/") ? redirect : "/gui/dashboard";
    } catch {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
    }
});
