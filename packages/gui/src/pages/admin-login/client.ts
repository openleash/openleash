/**
 * Client-side logic for the admin login page.
 */
import "../../shared/styles/auth.css";

document.getElementById("login-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("error-msg") as HTMLElement;
    errorEl.style.display = "none";

    const token = (document.getElementById("admin-token") as HTMLInputElement).value.trim();

    try {
        const res = await fetch("/v1/admin/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: "{}",
        });

        if (!res.ok) {
            const data = await res.json();
            errorEl.textContent = data?.error?.message || "Invalid token";
            errorEl.style.display = "block";
            return;
        }

        document.cookie = "openleash_admin=" + token + "; path=/; SameSite=Strict";
        window.location.href = "/gui/admin/dashboard";
    } catch {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
    }
});
