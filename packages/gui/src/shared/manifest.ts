import * as fs from "node:fs";
import * as path from "node:path";

interface ManifestEntry {
    file: string;
    name?: string;
    src?: string;
    isEntry?: boolean;
    css?: string[];
    imports?: string[];
}

type Manifest = Record<string, ManifestEntry>;

let cachedManifest: Manifest | null = null;
let clientDir: string | null = null;

/**
 * Initialize the manifest reader with the path to the client build output.
 * Call this once at server startup.
 */
export function initManifest(guiClientDir: string): void {
    clientDir = guiClientDir;
    const manifestPath = path.join(guiClientDir, ".vite", "manifest.json");
    if (fs.existsSync(manifestPath)) {
        cachedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } else {
        cachedManifest = null;
    }
}

/**
 * Resolve a client entry point (e.g. "common.ts") to its hashed asset path.
 * Returns the path relative to the assets base URL (e.g. "/gui/assets/common-abc123.js").
 */
export function resolveAsset(entry: string): string | null {
    if (!cachedManifest) return null;
    const manifestEntry = cachedManifest[entry];
    if (!manifestEntry) return null;
    return `/gui/${manifestEntry.file}`;
}

/**
 * Resolve CSS files associated with an entry point.
 *
 * Walks the entry's imported chunks so CSS that lives in a shared chunk
 * (e.g. a module imported by several pages) is linked too — Vite only lists a
 * chunk's CSS on the chunk itself, not on every entry that imports it.
 */
export function resolveAssetCss(entry: string): string[] {
    if (!cachedManifest) return [];
    const manifest = cachedManifest;
    const seen = new Set<string>();
    const css: string[] = [];

    const visit = (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        const node = manifest[key];
        if (!node) return;
        for (const f of node.css ?? []) {
            const href = `/gui/${f}`;
            if (!css.includes(href)) css.push(href);
        }
        for (const imp of node.imports ?? []) visit(imp);
    };

    visit(entry);
    return css;
}

/**
 * Generate HTML tags for a client entry point — script + associated CSS.
 */
export function assetTags(entry: string): string {
    const tags: string[] = [];

    for (const css of resolveAssetCss(entry)) {
        tags.push(`<link rel="stylesheet" href="${css}">`);
    }

    const js = resolveAsset(entry);
    if (js) {
        tags.push(`<script type="module" src="${js}"></script>`);
    }

    return tags.join("\n");
}

/**
 * Get the resolved client directory path (for static file serving).
 */
export function getClientDir(): string | null {
    return clientDir;
}
