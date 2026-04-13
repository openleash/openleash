import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    root: resolve(__dirname, "src"),
    build: {
        outDir: resolve(__dirname, "dist/client"),
        emptyOutDir: true,
        manifest: true,
        rolldownOptions: {
            input: {
                "shared/common": resolve(__dirname, "src/shared/common.ts"),
                "pages/audit/client": resolve(__dirname, "src/pages/audit/client.ts"),
                "pages/owners/client": resolve(__dirname, "src/pages/owners/client.ts"),
                "pages/agents/client": resolve(__dirname, "src/pages/agents/client.ts"),
                "pages/api-reference/client": resolve(
                    __dirname,
                    "src/pages/api-reference/client.ts",
                ),
                "pages/owner-login/client": resolve(
                    __dirname,
                    "src/pages/owner-login/client.ts",
                ),
                "pages/owner-setup/client": resolve(
                    __dirname,
                    "src/pages/owner-setup/client.ts",
                ),
                "pages/owner-profile/client": resolve(
                    __dirname,
                    "src/pages/owner-profile/client.ts",
                ),
                "pages/owner-policies/client": resolve(
                    __dirname,
                    "src/pages/owner-policies/client.ts",
                ),
                "pages/owner-policy-create/client": resolve(
                    __dirname,
                    "src/pages/owner-policy-create/client.ts",
                ),
                "pages/owner-agents/client": resolve(
                    __dirname,
                    "src/pages/owner-agents/client.ts",
                ),
                "pages/owner-approvals/client": resolve(
                    __dirname,
                    "src/pages/owner-approvals/client.ts",
                ),
                "pages/admin-login/client": resolve(
                    __dirname,
                    "src/pages/admin-login/client.ts",
                ),
                "pages/initial-setup/client": resolve(
                    __dirname,
                    "src/pages/initial-setup/client.ts",
                ),
                "pages/policies/client": resolve(
                    __dirname,
                    "src/pages/policies/client.ts",
                ),
                "pages/config/client": resolve(
                    __dirname,
                    "src/pages/config/client.ts",
                ),
                "pages/about/client": resolve(
                    __dirname,
                    "src/pages/about/client.ts",
                ),
                "pages/dashboard/client": resolve(
                    __dirname,
                    "src/pages/dashboard/client.ts",
                ),
                "pages/admin-agents/client": resolve(
                    __dirname,
                    "src/pages/admin-agents/client.ts",
                ),
                "pages/admin-organizations/client": resolve(
                    __dirname,
                    "src/pages/admin-organizations/client.ts",
                ),
                "pages/owner-organizations/client": resolve(
                    __dirname,
                    "src/pages/owner-organizations/client.ts",
                ),
                "pages/owner-dashboard/client": resolve(
                    __dirname,
                    "src/pages/owner-dashboard/client.ts",
                ),
            },
        },
    },
});
