/**
 * Lightweight vanilla JS toast notification system.
 *
 * Injects CSS and a global `olToast(message, variant?)` function into
 * every page rendered through `renderPage()`.
 *
 * Variants: 'success' | 'error' | 'warning' | 'info' (default: 'info')
 */

export function toastStyles(): string {
    return `
    #ol-toast-container {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .ol-toast {
      pointer-events: auto;
      min-width: 280px;
      max-width: 420px;
      padding: 12px 36px 12px 14px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--text-primary);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      position: relative;
      transform: translateX(calc(100% + 24px));
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .ol-toast.ol-toast-visible {
      transform: translateX(0);
      opacity: 1;
    }
    .ol-toast.ol-toast-exit {
      transform: translateX(calc(100% + 24px));
      opacity: 0;
    }
    .ol-toast-success { border-left: 4px solid var(--color-success); background: color-mix(in srgb, var(--color-success) 10%, var(--bg-elevated)); }
    .ol-toast-error   { border-left: 4px solid var(--color-danger); background: color-mix(in srgb, var(--color-danger) 10%, var(--bg-elevated)); }
    .ol-toast-warning { border-left: 4px solid var(--color-warning); background: color-mix(in srgb, var(--color-warning) 10%, var(--bg-elevated)); }
    .ol-toast-info    { border-left: 4px solid var(--text-muted); }
    .ol-toast-close {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0;
    }
    .ol-toast-close:hover { color: var(--text-primary); }
  `;
}

export function toastScript(): string {
    return `
    (function(){
      var container = document.createElement('div');
      container.id = 'ol-toast-container';
      document.body.appendChild(container);

      window.olToast = function(message, variant) {
        variant = variant || 'info';
        var toast = document.createElement('div');
        toast.className = 'ol-toast ol-toast-' + variant;
        toast.textContent = message;

        var closeBtn = document.createElement('button');
        closeBtn.className = 'ol-toast-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = function() { dismiss(toast); };
        toast.appendChild(closeBtn);

        container.appendChild(toast);

        // Trigger enter animation on next frame
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            toast.classList.add('ol-toast-visible');
          });
        });

        var duration = variant === 'error' ? 6000 : 3500;
        var timer = setTimeout(function() { dismiss(toast); }, duration);
        toast._timer = timer;

        function dismiss(el) {
          clearTimeout(el._timer);
          el.classList.remove('ol-toast-visible');
          el.classList.add('ol-toast-exit');
          setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
          }, 300);
        }
      };
    })();
  `;
}
