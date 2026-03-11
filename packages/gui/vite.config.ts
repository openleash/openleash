import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    root: resolve(__dirname, "client"),
    build: {
        outDir: resolve(__dirname, "dist/client"),
        emptyDirOnly: true,
        manifest: true,
        rollupOptions: {
            input: {
                common: resolve(__dirname, "client/common.ts"),
            },
        },
    },
});
