/**
 * Client-side logic for the passphrase recovery page.
 */
import "../../shared/styles/auth.css";
import "./style.css";

(function prefillEmail() {
    const fromQuery = new URLSearchParams(window.location.search).get("email");
    if (fromQuery) {
        (document.getElementById("email") as HTMLInputElement).value = fromQuery;
    }
})();

document.getElementById("recover-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("error-msg") as HTMLElement;
    const btn = document.getElementById("submit-btn") as HTMLButtonElement;
    errorEl.style.display = "none";

    const email = (document.getElementById("email") as HTMLInputElement).value.trim();
    if (!email) {
        errorEl.textContent = "Email is required";
        errorEl.style.display = "block";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
        const res = await fetch("/v1/owner/recover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            errorEl.textContent = data?.error?.message || "Recovery request failed";
            errorEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Send recovery link";
            return;
        }

        document.getElementById("recover-form")!.style.display = "none";
        document.querySelector<HTMLElement>(".orec-back")!.style.display = "none";
        document.getElementById("success-msg")!.style.display = "block";
    } catch {
        errorEl.textContent = "Network error";
        errorEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Send recovery link";
    }
});
