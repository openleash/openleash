/**
 * Shared CSS theme variables.
 *
 * Single source of truth for colors, typography, and base tokens used across
 * the main layout and standalone pages (login, setup, initial-setup).
 */

/** Base dark theme variables (`:root`). */
export const THEME_DARK = `
      --font-body: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
      --bg-deep: #050a0e;
      --bg-surface: #0a1118;
      --bg-elevated: #111d28;
      --green-bright: #34d399;
      --green-mid: #10b981;
      --green-dark: #065f46;
      --text-primary: #e8f0f8;
      --text-secondary: #8899aa;
      --text-muted: #556677;
      --border-subtle: rgba(136, 153, 170, 0.15);
      --radius-md: 12px;
      --color-primary: #10b981;
      --color-success: #34d399;
      --color-danger: #f87171;
      --color-warning: #fbbf24;
      --color-info: #60a5fa;`;

/** Light theme overrides (`body.theme-light`). */
export const THEME_LIGHT = `
      --bg-deep: #f5f7fa;
      --bg-surface: #ffffff;
      --bg-elevated: #f0f2f5;
      --green-bright: #047e58;
      --green-mid: #059669;
      --green-dark: #d1fae5;
      --text-primary: #1a1a2e;
      --text-secondary: #4a5568;
      --text-muted: #5c708c;
      --border-subtle: rgba(0, 0, 0, 0.1);
      --color-primary: #059669;
      --color-success: #059669;
      --color-danger: #dc2626;
      --color-warning: #d97706;
      --color-info: #2563eb;`;
