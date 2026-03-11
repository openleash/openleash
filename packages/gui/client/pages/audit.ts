/**
 * Client-side logic for the audit log page.
 */

declare global {
    interface Window {
        toggleAccordion: (idx: number) => void;
        filterEvents: () => void;
    }
}

window.toggleAccordion = function (idx: number) {
    const row = document.getElementById("row-" + idx)!;
    const detail = document.getElementById("detail-" + idx)!;
    const isOpen = detail.classList.contains("open");
    if (isOpen) {
        detail.classList.remove("open");
        row.classList.remove("expanded");
    } else {
        detail.classList.add("open");
        row.classList.add("expanded");
    }
};

window.filterEvents = function () {
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
};
