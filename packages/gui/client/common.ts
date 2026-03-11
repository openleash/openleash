/**
 * Common client-side entry point.
 * All global helpers previously inlined in layout.ts.
 */
import "./styles/main.css";

// ─── Types ──────────────────────────────────────────────────────────

interface ApiErrorResponse {
    error?: {
        code?: string;
        message?: string;
        field_errors?: Record<string, string>;
    };
}

type DialogValidator = (value: string) => string | null | Promise<string | null>;

declare global {
    interface Window {
        toggleSidebar: () => void;
        setTheme: (t: string) => void;
        applyTheme: (t: string) => void;
        closeAllPopovers: () => void;
        toggleInfo: (e: Event, id: string) => void;
        copyId: (el: HTMLElement, id: string) => void;
        olFieldError: (id: string, msg?: string) => void;
        olClearFieldErrors: (container?: string) => void;
        olApiError: (data: ApiErrorResponse, fallback?: string) => string;
        olToast: (message: string, variant?: string) => void;
        olAlert: (msg: string, title?: string) => Promise<void>;
        olConfirm: (msg: string, title?: string) => Promise<unknown>;
        olPrompt: (msg: string, placeholder?: string, title?: string) => Promise<string | null>;
        ol2FA: (onSubmit?: (code: string) => string | null | Promise<string | null>) => Promise<string | null>;
        olDialogCancel: () => void;
        olDialogOk: () => Promise<void>;
    }
}

// ─── Sidebar ────────────────────────────────────────────────────────

window.toggleSidebar = function () {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem(
        "ol_sidebar_collapsed",
        document.body.classList.contains("sidebar-collapsed") ? "1" : "0",
    );
};

// ─── Theme ──────────────────────────────────────────────────────────

window.applyTheme = function (t: string) {
    const isLight =
        t === "light" ||
        (t === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.body.classList.toggle("theme-light", isLight);
};

window.setTheme = function (t: string) {
    localStorage.setItem("ol_theme", t);
    window.applyTheme(t);
    document.querySelectorAll<HTMLElement>(".theme-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-theme") === t);
    });
};

// Initialize theme buttons and listen for system theme changes
(function () {
    const t = localStorage.getItem("ol_theme") || "system";
    document.querySelectorAll<HTMLElement>(".theme-btn").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-theme") === t);
    });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
        const cur = localStorage.getItem("ol_theme") || "system";
        if (cur === "system") window.applyTheme("system");
    });
})();

// ─── Local time conversion ──────────────────────────────────────────

(function () {
    function pad(n: number): string {
        return n < 10 ? "0" + n : "" + n;
    }
    function isoLocal(d: Date, dateOnly: boolean): string {
        const y = d.getFullYear(),
            m = pad(d.getMonth() + 1),
            day = pad(d.getDate());
        if (dateOnly) return y + "-" + m + "-" + day;
        return y + "-" + m + "-" + day + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    try {
        const cells = document.querySelectorAll<HTMLElement>(".local-time[data-utc]");
        for (let i = 0; i < cells.length; i++) {
            const utc = cells[i].getAttribute("data-utc")!;
            const d = new Date(utc);
            if (!isNaN(d.getTime())) {
                const dateOnly = cells[i].getAttribute("data-date-only") === "1";
                cells[i].textContent = isoLocal(d, dateOnly);
                cells[i].title = "UTC: " + utc.slice(0, 19).replace("T", " ");
            }
        }
    } catch (_) {
        /* ignore */
    }
})();

// ─── Info popovers ──────────────────────────────────────────────────

window.closeAllPopovers = function () {
    document.querySelectorAll<HTMLElement>(".info-popover.open").forEach((p) => {
        p.classList.remove("open");
        const orig = document.querySelector<HTMLElement>('[data-info-return="' + p.id + '"]');
        if (orig) {
            orig.appendChild(p);
            orig.removeAttribute("data-info-return");
        }
    });
};

window.toggleInfo = function (e: Event, id: string) {
    e.stopPropagation();
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains("open");
    window.closeAllPopovers();
    if (!wasOpen) {
        const wrap = el.parentElement;
        if (wrap) wrap.setAttribute("data-info-return", id);
        document.body.appendChild(el);
        const trigger = e.currentTarget as HTMLElement;
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
};

document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".info-popover") && !target.closest(".info-trigger")) {
        window.closeAllPopovers();
    }
});

// ─── Copy ID ────────────────────────────────────────────────────────

window.copyId = function (el: HTMLElement, id: string) {
    navigator.clipboard.writeText(id);
    let t = (el as any)._copyTooltip as HTMLElement | undefined;
    if (!t) {
        t = document.createElement("span");
        t.className = "copy-tooltip";
        t.textContent = "Copied!";
        document.body.appendChild(t);
        (el as any)._copyTooltip = t;
    }
    const r = el.getBoundingClientRect();
    t.style.left = r.left + r.width / 2 - t.offsetWidth / 2 + "px";
    t.style.top = r.top - t.offsetHeight - 6 + "px";
    t.classList.add("show");
    clearTimeout((el as any)._copyTimer);
    (el as any)._copyTimer = setTimeout(() => {
        t!.classList.remove("show");
    }, 1200);
};

// ─── Field errors ───────────────────────────────────────────────────

window.olFieldError = function (id: string, msg?: string) {
    const el = document.getElementById("err-" + id);
    if (el) el.textContent = msg || "";
    const inp = document.getElementById(id);
    if (inp) {
        if (msg) inp.classList.add("input-error");
        else inp.classList.remove("input-error");
    }
};

window.olClearFieldErrors = function (container?: string) {
    const scope = container ? document.getElementById(container) : document;
    if (!scope) return;
    scope.querySelectorAll<HTMLElement>(".field-error").forEach((el) => (el.textContent = ""));
    scope.querySelectorAll<HTMLElement>(".input-error").forEach((el) => el.classList.remove("input-error"));
};

window.olApiError = function (data: ApiErrorResponse, fallback?: string): string {
    if (!data || !data.error) return fallback || "An error occurred";
    const e = data.error;
    if (e.code === "VALIDATION_ERROR" && e.field_errors) {
        const fe = e.field_errors;
        const keys = Object.keys(fe);
        for (const key of keys) {
            window.olFieldError(key, fe[key]);
        }
        return keys.map((k) => fe[k]).join("; ");
    }
    return e.message || fallback || "An error occurred";
};

// ─── Toast notifications ────────────────────────────────────────────

(function () {
    const container = document.createElement("div");
    container.id = "ol-toast-container";
    document.body.appendChild(container);

    function dismiss(el: HTMLElement) {
        clearTimeout((el as any)._timer);
        el.classList.remove("ol-toast-visible");
        el.classList.add("ol-toast-exit");
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }

    window.olToast = function (message: string, variant?: string) {
        variant = variant || "info";
        const toast = document.createElement("div");
        toast.className = "ol-toast ol-toast-" + variant;

        const msgSpan = document.createElement("span");
        msgSpan.textContent = message;
        toast.appendChild(msgSpan);

        const closeBtn = document.createElement("button");
        closeBtn.className = "ol-toast-close";
        closeBtn.innerHTML = "&times;";
        closeBtn.onclick = () => dismiss(toast);
        toast.appendChild(closeBtn);

        container.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add("ol-toast-visible");
            });
        });

        const duration = variant === "error" ? 6000 : 3500;
        (toast as any)._timer = setTimeout(() => dismiss(toast), duration);
    };
})();

// ─── Dialog system ──────────────────────────────────────────────────

let _olResolve: ((value: any) => void) | null = null;
let _olDialogValidator: DialogValidator | null = null;

function _olDialogReset() {
    window.olFieldError("ol-dialog-input", "");
    const inp = document.getElementById("ol-dialog-input") as HTMLInputElement;
    inp.removeAttribute("maxlength");
    inp.removeAttribute("inputmode");
    inp.oninput = null;
    _olDialogValidator = null;
}

window.olDialogCancel = function () {
    _olDialogReset();
    document.getElementById("ol-dialog")!.classList.remove("open");
    if (_olResolve) {
        const fn = _olResolve;
        _olResolve = null;
        fn(null);
    }
};

window.olDialogOk = async function () {
    const wrap = document.getElementById("ol-dialog-input-wrap")!;
    const val = wrap.style.display !== "none"
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
        } catch (e: any) {
            err = e.message || "An error occurred";
        }
        btn.disabled = false;
        btn.textContent = orig;
        if (err) {
            window.olFieldError("ol-dialog-input", err);
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
};

window.olAlert = function (msg: string, title?: string): Promise<void> {
    return new Promise((r) => {
        _olResolve = () => r(undefined);
        document.getElementById("ol-dialog-title")!.textContent = title || "Notice";
        document.getElementById("ol-dialog-msg")!.textContent = msg;
        document.getElementById("ol-dialog-input-wrap")!.style.display = "none";
        document.getElementById("ol-dialog-cancel")!.style.display = "none";
        (document.getElementById("ol-dialog-ok") as HTMLButtonElement).textContent = "OK";
        document.getElementById("ol-dialog")!.classList.add("open");
    });
};

window.olConfirm = function (msg: string, title?: string): Promise<unknown> {
    return new Promise((r) => {
        _olResolve = r;
        document.getElementById("ol-dialog-title")!.textContent = title || "Confirm";
        document.getElementById("ol-dialog-msg")!.textContent = msg;
        document.getElementById("ol-dialog-input-wrap")!.style.display = "none";
        document.getElementById("ol-dialog-cancel")!.style.display = "";
        (document.getElementById("ol-dialog-ok") as HTMLButtonElement).textContent = "Confirm";
        document.getElementById("ol-dialog")!.classList.add("open");
    });
};

window.olPrompt = function (msg: string, placeholder?: string, title?: string): Promise<string | null> {
    return new Promise((r) => {
        _olResolve = r;
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
};

window.ol2FA = function (onSubmit?: (code: string) => string | null | Promise<string | null>): Promise<string | null> {
    return new Promise((r) => {
        _olResolve = (v) => r(v === null ? null : (v as string).replace(/\s/g, ""));
        document.getElementById("ol-dialog-title")!.textContent = "Two-Factor Authentication";
        document.getElementById("ol-dialog-msg")!.textContent = "Enter your 2FA code:";
        const inp = document.getElementById("ol-dialog-input") as HTMLInputElement;
        inp.value = "";
        inp.placeholder = "000 000";
        inp.setAttribute("inputmode", "numeric");
        inp.setAttribute("maxlength", "7");
        inp.oninput = function (this: HTMLInputElement) {
            const raw = this.value.replace(/[^0-9]/g, "").slice(0, 6);
            const formatted = raw.length > 3 ? raw.slice(0, 3) + " " + raw.slice(3) : raw;
            if (this.value !== formatted) this.value = formatted;
            window.olFieldError("ol-dialog-input", "");
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
};
