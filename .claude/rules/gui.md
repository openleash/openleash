---
paths:
  - "packages/gui/**"
---

# @openleash/gui

Server-rendered HTML GUI with Vite-bundled client assets. Depends on `@openleash/core`.

## Structure

Each page is a directory under `src/pages/<page-name>/`:

- `render.ts` — Server-side function returning an HTML string. Compiled by `tsc`.
- `client.ts` — Browser-side TypeScript. Bundled by Vite.
- `style.css` — Page-specific CSS. Imported by `client.ts`, bundled by Vite.

Shared code under `src/shared/`:

- `layout.ts` — `renderPage()`, navigation, `escapeHtml`, `infoIcon`, popover content.
- `common.ts` — Client entry point: theme, sidebar, dialogs, toasts, copy-to-clipboard, field errors.
- `manifest.ts` — `initManifest()`, `assetTags(entry)` — resolves Vite manifest to `<link>`/`<script>` tags.
- `validation.ts` — Shared Zod schemas.
- `styles/main.css` — Global styles and utility classes.
- `styles/auth.css` — Standalone auth page styles (login, setup).

## Build

- Server code (`render.ts`, `layout.ts`, `manifest.ts`): compiled by `tsc -b`.
- Client code (`client.ts`, `style.css`, `common.ts`): bundled by `vite build` → `dist/client/`.
- Client files excluded from `tsconfig.json`; use `tsconfig.client.json` for IDE support.
- `assetTags("pages/<page>/client.ts")` in `render.ts` emits the correct `<link>` + `<script>` tags.

## Adding a new page

1. Create `src/pages/<name>/render.ts`, `client.ts`, `style.css`.
2. Include `${assetTags("pages/<name>/client.ts")}` in the render template.
3. Add entry to `vite.config.ts` under `rollupOptions.input`.
4. Export the render function from `src/index.ts`.

## Conventions

- No inline `style="..."` in templates (except `<col style="width:...">` for table columns).
- No inline `<script>` blocks — all JS in `client.ts`.
- Use shared utility classes from `main.css` before creating page-specific ones.
- Page-specific CSS classes use a short prefix (e.g. `dash-`, `opol-`, `audit-`).
- Pass server data to client via `window.__PAGE_DATA__`.
