import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    root: resolve(__dirname, "client"),
    build: {
        outDir: resolve(__dirname, "dist/client"),
        manifest: true,
        rollupOptions: {
            input: {
                common: resolve(__dirname, "client/common.ts"),
                "pages/owner-profile": resolve(__dirname, "client/pages/owner-profile.ts"),
                "pages/owner-policies": resolve(__dirname, "client/pages/owner-policies.ts"),
                "pages/owner-agents": resolve(__dirname, "client/pages/owner-agents.ts"),
                "pages/owner-approvals": resolve(__dirname, "client/pages/owner-approvals.ts"),
                "pages/owner-policy-create": resolve(
                    __dirname,
                    "client/pages/owner-policy-create.ts",
                ),
                "pages/agents": resolve(__dirname, "client/pages/agents.ts"),
                "pages/owners": resolve(__dirname, "client/pages/owners.ts"),
                "pages/audit": resolve(__dirname, "client/pages/audit.ts"),
                "pages/dashboard": resolve(__dirname, "client/pages/dashboard.ts"),
                "pages/policies": resolve(__dirname, "client/pages/policies.ts"),
                "pages/mcp-glove": resolve(__dirname, "client/pages/mcp-glove.ts"),
                "pages/api-reference": resolve(__dirname, "client/pages/api-reference.ts"),
                "pages/owner-login": resolve(__dirname, "client/pages/owner-login.ts"),
                "pages/owner-setup": resolve(__dirname, "client/pages/owner-setup.ts"),
                "pages/initial-setup": resolve(__dirname, "client/pages/initial-setup.ts"),
            },
        },
    },
});
