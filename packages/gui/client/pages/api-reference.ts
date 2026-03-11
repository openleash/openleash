/**
 * Client-side logic for the API reference page.
 * Syncs light/dark theme from app to the Scalar iframe.
 */

(function () {
    const frame = document.getElementById("scalar-frame") as HTMLIFrameElement;

    function isLight(): boolean {
        const t = localStorage.getItem("ol_theme") || "system";
        return t === "light" || (t === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    }

    function syncTheme(): void {
        try {
            const doc = frame.contentDocument;
            if (!doc) return;
            const el = doc.body;
            if (!el) return;
            const light = isLight();
            el.classList.toggle("light-mode", light);
            el.classList.toggle("dark-mode", !light);
        } catch {
            /* cross-origin */
        }
    }

    frame.addEventListener("load", () => syncTheme());
    new MutationObserver(() => syncTheme()).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => syncTheme());
})();
