/**
 * Common client-side entry point.
 * All global helpers previously inlined in layout.ts.
 */
import dayjs from "dayjs";
import "./styles/main.css";

// ─── Types ──────────────────────────────────────────────────────────

export interface ApiErrorResponse {
    error?: {
        code?: string;
        message?: string;
        field_errors?: Record<string, string>;
    };
}

type DialogValidator = (value: string) => string | null | Promise<string | null>;
type DialogResolveValue = string | true | null;

const _copyTooltips = new WeakMap<HTMLElement, HTMLElement>();
const _copyTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const _toastTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

// ─── Sidebar ────────────────────────────────────────────────────────

function toggleSidebar() {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem(
        "ol_sidebar_collapsed",
        document.body.classList.contains("sidebar-collapsed") ? "1" : "0",
    );
}

// ─── Theme ──────────────────────────────────────────────────────────

function applyTheme(t: string) {
    const isLight =
        t === "light" ||
        (t === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.body.classList.toggle("theme-light", isLight);
}

function setTheme(t: string) {
    localStorage.setItem("ol_theme", t);
    applyTheme(t);
    document.querySelectorAll<HTMLElement>(".theme-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-theme") === t);
    });
}

// Initialize theme buttons and listen for system theme changes
(function () {
    const t = localStorage.getItem("ol_theme") || "system";
    document.querySelectorAll<HTMLElement>(".theme-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-theme") === t);
    });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
        const cur = localStorage.getItem("ol_theme") || "system";
        if (cur === "system") applyTheme("system");
    });
})();

// ─── Local time conversion ──────────────────────────────────────────

(function () {
    try {
        const cells = document.querySelectorAll<HTMLElement>(".local-time[data-utc]");
        for (let i = 0; i < cells.length; i++) {
            const utc = cells[i].getAttribute("data-utc")!;
            const d = dayjs(utc);
            if (d.isValid()) {
                const dateOnly = cells[i].getAttribute("data-date-only") === "1";
                const fmt = dateOnly ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm:ss";
                cells[i].textContent = d.format(fmt);
                cells[i].title = "UTC: " + dayjs(utc).format("YYYY-MM-DD HH:mm:ss");
            }
        }
    } catch (_) {
        /* ignore */
    }
})();

// ─── Info popovers ──────────────────────────────────────────────────

function closeAllPopovers() {
    document.querySelectorAll<HTMLElement>(".info-popover.open").forEach((p) => {
        p.classList.remove("open");
        const orig = document.querySelector<HTMLElement>('[data-info-return="' + p.id + '"]');
        if (orig) {
            orig.appendChild(p);
            orig.removeAttribute("data-info-return");
        }
    });
}

function toggleInfo(trigger: HTMLElement, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains("open");
    closeAllPopovers();
    if (!wasOpen) {
        const wrap = el.parentElement;
        if (wrap) wrap.setAttribute("data-info-return", id);
        document.body.appendChild(el);
        const tr = trigger.getBoundingClientRect();
        el.style.left = "-9999px";
        el.style.top = "-9999px";
        el.classList.add("open");
        const pr = el.getBoundingClientRect();
        let left = tr.left + tr.width / 2 - pr.width / 2;
        let top = tr.bottom + 8;
        if (left < 8) left = 8;
        if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - 8 - pr.width;
        if (top + pr.height > window.innerHeight - 8) {
            top = tr.top - pr.height - 8;
        }
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.setProperty("--arrow-left", tr.left + tr.width / 2 - left + "px");
    }
}

// ─── Global click delegation ────────────────────────────────────────

document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // Info triggers
    const trigger = target.closest<HTMLElement>(".info-trigger[data-info-id]");
    if (trigger) {
        e.stopPropagation();
        toggleInfo(trigger, trigger.getAttribute("data-info-id")!);
        return;
    }

    // Copyable IDs
    const copyable = target.closest<HTMLElement>(".copyable[data-copy-id]");
    if (copyable) {
        e.stopPropagation();
        copyId(copyable, copyable.getAttribute("data-copy-id")!);
        return;
    }

    // Close popovers on outside click
    if (!target.closest(".info-popover")) {
        closeAllPopovers();
    }
});

// ─── Copy ID ────────────────────────────────────────────────────────

function copyId(el: HTMLElement, id: string) {
    navigator.clipboard.writeText(id);
    let t = _copyTooltips.get(el);
    if (!t) {
        t = document.createElement("span");
        t.className = "copy-tooltip";
        t.textContent = "Copied!";
        document.body.appendChild(t);
        _copyTooltips.set(el, t);
    }
    const r = el.getBoundingClientRect();
    t.style.left = r.left + r.width / 2 - t.offsetWidth / 2 + "px";
    t.style.top = r.top - t.offsetHeight - 6 + "px";
    t.classList.add("show");
    const prev = _copyTimers.get(el);
    if (prev) clearTimeout(prev);
    _copyTimers.set(el, setTimeout(() => {
        t!.classList.remove("show");
    }, 1200));
}

// ─── Field errors ───────────────────────────────────────────────────

export function olFieldError(id: string, msg?: string) {
    const el = document.getElementById("err-" + id);
    if (el) el.textContent = msg || "";
    const inp = document.getElementById(id);
    if (inp) {
        if (msg) inp.classList.add("input-error");
        else inp.classList.remove("input-error");
    }
}

export function olClearFieldErrors(container?: string) {
    const scope = container ? document.getElementById(container) : document;
    if (!scope) return;
    scope.querySelectorAll<HTMLElement>(".field-error").forEach((el) => (el.textContent = ""));
    scope
        .querySelectorAll<HTMLElement>(".input-error")
        .forEach((el) => el.classList.remove("input-error"));
}

export function olApiError(data: ApiErrorResponse, fallback?: string): string {
    if (!data || !data.error) return fallback || "An error occurred";
    const e = data.error;
    if (e.code === "VALIDATION_ERROR" && e.field_errors) {
        const fe = e.field_errors;
        const keys = Object.keys(fe);
        for (const key of keys) {
            olFieldError(key, fe[key]);
        }
        return keys.map((k) => fe[k]).join("; ");
    }
    return e.message || fallback || "An error occurred";
}

// ─── Toast notifications ────────────────────────────────────────────

const _toastContainer = document.createElement("div");
_toastContainer.id = "ol-toast-container";
document.body.appendChild(_toastContainer);

function _dismissToast(el: HTMLElement) {
    const timer = _toastTimers.get(el);
    if (timer) clearTimeout(timer);
    el.classList.remove("ol-toast-visible");
    el.classList.add("ol-toast-exit");
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
}

export function olToast(message: string, variant?: string) {
    variant = variant || "info";
    const toast = document.createElement("div");
    toast.className = "ol-toast ol-toast-" + variant;

    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ol-toast-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.onclick = () => _dismissToast(toast);
    toast.appendChild(closeBtn);

    _toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add("ol-toast-visible");
        });
    });

    const duration = variant === "error" ? 6000 : 3500;
    _toastTimers.set(toast, setTimeout(() => _dismissToast(toast), duration));
}

// ─── Dialog system ──────────────────────────────────────────────────

let _olResolve: ((value: DialogResolveValue) => void) | null = null;
let _olDialogValidator: DialogValidator | null = null;

function _olDialogReset() {
    olFieldError("ol-dialog-input", "");
    const inp = document.getElementById("ol-dialog-input") as HTMLInputElement;
    inp.removeAttribute("maxlength");
    inp.removeAttribute("inputmode");
    inp.oninput = null;
    _olDialogValidator = null;
}

function olDialogCancel() {
    _olDialogReset();
    document.getElementById("ol-dialog")!.classList.remove("open");
    if (_olResolve) {
        const fn = _olResolve;
        _olResolve = null;
        fn(null);
    }
}

async function olDialogOk() {
    const wrap = document.getElementById("ol-dialog-input-wrap")!;
    const val =
        wrap.style.display !== "none"
            ? (document.getElementById("ol-dialog-input") as HTMLInputElement).value
            : true;
    if (_olDialogValidator) {
        const btn = document.getElementById("ol-dialog-ok") as HTMLButtonElement;
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Verifying\u2026";
        let err: string | null;
        try {
            err = await _olDialogValidator(val as string);
        } catch (e: unknown) {
            err = e instanceof Error ? e.message : "An error occurred";
        }
        btn.disabled = false;
        btn.textContent = orig;
        if (err) {
            olFieldError("ol-dialog-input", err);
            return;
        }
    }
    document.getElementById("ol-dialog")!.classList.remove("open");
    _olDialogReset();
    if (_olResolve) {
        const fn = _olResolve;
        _olResolve = null;
        fn(val);
    }
}

export function olAlert(msg: string, title?: string): Promise<void> {
    return new Promise((r) => {
        _olResolve = () => r(undefined);
        document.getElementById("ol-dialog-title")!.textContent = title || "Notice";
        document.getElementById("ol-dialog-msg")!.textContent = msg;
        document.getElementById("ol-dialog-input-wrap")!.style.display = "none";
        document.getElementById("ol-dialog-cancel")!.style.display = "none";
        (document.getElementById("ol-dialog-ok") as HTMLButtonElement).textContent = "OK";
        document.getElementById("ol-dialog")!.classList.add("open");
    });
}

export function olConfirm(msg: string, title?: string): Promise<true | null> {
    return new Promise((r) => {
        _olResolve = (v) => r(v === true ? true : null);
        document.getElementById("ol-dialog-title")!.textContent = title || "Confirm";
        document.getElementById("ol-dialog-msg")!.textContent = msg;
        document.getElementById("ol-dialog-input-wrap")!.style.display = "none";
        document.getElementById("ol-dialog-cancel")!.style.display = "";
        (document.getElementById("ol-dialog-ok") as HTMLButtonElement).textContent = "Confirm";
        document.getElementById("ol-dialog")!.classList.add("open");
    });
}

export function olPrompt(
    msg: string,
    placeholder?: string,
    title?: string,
): Promise<string | null> {
    return new Promise((r) => {
        _olResolve = (v) => r(typeof v === "string" ? v : null);
        document.getElementById("ol-dialog-title")!.textContent = title || "Input";
        document.getElementById("ol-dialog-msg")!.textContent = msg;
        const inp = document.getElementById("ol-dialog-input") as HTMLInputElement;
        inp.value = "";
        inp.placeholder = placeholder || "";
        document.getElementById("ol-dialog-input-wrap")!.style.display = "block";
        document.getElementById("ol-dialog-cancel")!.style.display = "";
        (document.getElementById("ol-dialog-ok") as HTMLButtonElement).textContent = "OK";
        document.getElementById("ol-dialog")!.classList.add("open");
        inp.focus();
    });
}

export function ol2FA(
    onSubmit?: (code: string) => string | null | Promise<string | null>,
): Promise<string | null> {
    return new Promise((r) => {
        _olResolve = (v) => r(typeof v === "string" ? v.replace(/\s/g, "") : null);
        document.getElementById("ol-dialog-title")!.textContent = "Two-Factor Authentication";
        document.getElementById("ol-dialog-msg")!.textContent = "Enter your 2FA code:";
        const inp = document.getElementById("ol-dialog-input") as HTMLInputElement;
        inp.value = "";
        inp.placeholder = "000 000";
        inp.setAttribute("inputmode", "numeric");
        inp.setAttribute("maxlength", "7");
        inp.oninput = () => {
            const raw = inp.value.replace(/[^0-9]/g, "").slice(0, 6);
            const formatted = raw.length > 3 ? raw.slice(0, 3) + " " + raw.slice(3) : raw;
            if (inp.value !== formatted) inp.value = formatted;
            olFieldError("ol-dialog-input", "");
        };
        document.getElementById("ol-dialog-input-wrap")!.style.display = "block";
        document.getElementById("ol-dialog-cancel")!.style.display = "";
        (document.getElementById("ol-dialog-ok") as HTMLButtonElement).textContent = "Confirm";
        _olDialogValidator = (v: string) => {
            const digits = v.replace(/\s/g, "");
            if (!/^\d{6}$/.test(digits)) return "Code must be exactly 6 digits";
            if (onSubmit) return onSubmit(digits);
            return null;
        };
        document.getElementById("ol-dialog")!.classList.add("open");
        inp.focus();
    });
}

// ─── Event listeners for layout chrome ──────────────────────────────

document.querySelectorAll<HTMLElement>(".theme-btn").forEach((b) => {
    b.addEventListener("click", () => setTheme(b.getAttribute("data-theme")!));
});

document.querySelector(".sidebar-toggle")?.addEventListener("click", toggleSidebar);

document.getElementById("ol-dialog")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) olDialogCancel();
});
document.getElementById("ol-dialog-cancel")?.addEventListener("click", olDialogCancel);
document.getElementById("ol-dialog-ok")?.addEventListener("click", olDialogOk);

document.getElementById("nav-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    fetch("/v1/owner/logout", { method: "POST" });
    document.cookie = "openleash_session=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/gui/login";
});
