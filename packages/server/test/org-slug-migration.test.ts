import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createFileDataStore, readState, writeState } from "@openleash/core";
import type { DataStore, StateData } from "@openleash/core";
import { migrateOrgSlugs } from "../src/bootstrap.js";

/**
 * These tests simulate the pre-slug state shape: an org file without a slug
 * field, and a state entry without a slug. They verify that `migrateOrgSlugs`
 * backfills both sides and is idempotent on subsequent runs.
 */
describe("migrateOrgSlugs", () => {
    let dataDir: string;
    let store: DataStore;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openleash-migration-"));
        store = createFileDataStore(dataDir);
        store.initialize();
    });

    afterEach(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    function seedPreSlugOrg(displayName: string): string {
        const orgId = crypto.randomUUID();
        // Write an org file in the old shape (no slug field in frontmatter)
        const orgPath = path.join(dataDir, "organizations", `${orgId}.md`);
        fs.writeFileSync(
            orgPath,
            `---\norg_id: ${orgId}\ndisplay_name: ${displayName}\nstatus: ACTIVE\nattributes: {}\ncreated_at: "${new Date().toISOString()}"\ncreated_by_user_id: ${crypto.randomUUID()}\n---\n`,
        );
        // Push to state without slug (simulating pre-migration state.md)
        const state = readState(dataDir) as StateData & {
            organizations: Array<{ org_id: string; slug?: string; path: string }>;
        };
        state.organizations.push({ org_id: orgId, path: `./organizations/${orgId}.md` } as unknown as StateData["organizations"][number]);
        writeState(dataDir, state);
        return orgId;
    }

    it("assigns a slug to every legacy org and is idempotent", () => {
        const orgA = seedPreSlugOrg("Acme Corp");
        const orgB = seedPreSlugOrg("Beta Inc");

        const first = migrateOrgSlugs(store);
        expect(first.migrated).toBe(2);

        const state = store.state.getState();
        const a = state.organizations.find((e) => e.org_id === orgA)!;
        const b = state.organizations.find((e) => e.org_id === orgB)!;
        expect(a.slug).toBe("acme-corp");
        expect(b.slug).toBe("beta-inc");

        // Org file frontmatter also updated
        expect(store.organizations.read(orgA).slug).toBe("acme-corp");
        expect(store.organizations.read(orgB).slug).toBe("beta-inc");

        // Idempotent
        const second = migrateOrgSlugs(store);
        expect(second.migrated).toBe(0);
    });

    it("disambiguates duplicate display names with a numeric suffix", () => {
        const orgA = seedPreSlugOrg("Acme");
        const orgB = seedPreSlugOrg("Acme");

        migrateOrgSlugs(store);

        const state = store.state.getState();
        const slugs = [
            state.organizations.find((e) => e.org_id === orgA)!.slug,
            state.organizations.find((e) => e.org_id === orgB)!.slug,
        ].sort();
        expect(slugs).toEqual(["acme", "acme-2"]);
    });

    it("leaves orgs that already have slugs untouched", () => {
        // Create via normal repo (slug will be present)
        const orgId = crypto.randomUUID();
        store.organizations.write({
            org_id: orgId,
            slug: "pre-existing",
            display_name: "Already Slugged",
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            created_by_user_id: crypto.randomUUID(),
            verification_status: "unverified",
        });
        store.state.updateState((s) => {
            s.organizations.push({
                org_id: orgId,
                slug: "pre-existing",
                path: `./organizations/${orgId}.md`,
            });
        });

        const result = migrateOrgSlugs(store);
        expect(result.migrated).toBe(0);
        expect(store.organizations.read(orgId).slug).toBe("pre-existing");
    });
});
