/**
 * Client-side logic for the audit log page.
 */
import "../styles/pages/audit.css";

function filterEvents() {
    const val = (document.getElementById("event-filter") as HTMLSelectElement).value;
    const rows = document.querySelectorAll<HTMLElement>("tr[data-event-type]");
    let visible = 0;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const match = !val || row.getAttribute("data-event-type") === val;
        row.style.display = match ? "" : "none";
        if (!match && row.classList.contains("accordion-detail")) {
            row.classList.remove("open");
        }
        if (!match && row.classList.contains("accordion-row")) {
            row.classList.remove("expanded");
        }
        if (match && row.classList.contains("accordion-row")) {
            visible++;
        }
    }
    const counter = document.getElementById("filter-count");
    if (counter) {
        counter.textContent = val ? visible + " event" + (visible !== 1 ? "s" : "") : "";
    }
}

// ─── Event bindings ─────────────────────────────────────────────────

document.querySelectorAll<HTMLElement>(".accordion-row").forEach((row) => {
    row.addEventListener("click", () => {
        const detail = row.nextElementSibling as HTMLElement;
        if (detail?.classList.contains("accordion-detail")) {
            detail.classList.toggle("open");
            row.classList.toggle("expanded");
        }
    });
});

document.getElementById("event-filter")?.addEventListener("change", filterEvents);
