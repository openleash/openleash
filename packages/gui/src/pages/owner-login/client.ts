/**
 * Client-side logic for the owner login page.
 */
import "../../shared/styles/auth.css";

// Pre-fill owner ID from URL params
(function () {
    const p = new URLSearchParams(window.location.search);
    const oid = p.get("owner_id");
    if (oid) (document.getElementById("owner-id") as HTMLInputElement).value = oid;
})();

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

        document.cookie = "openleash_session=" + data.token + "; path=/; SameSite=Strict";
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get("redirect");
        window.location.href = redirect && redirect.startsWith("/gui/") ? redirect : "/gui/dashboard";
    } catch {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
    }
});
