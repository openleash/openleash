import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import { resolveSystemRoles } from "@openleash/core";
import type { OpenleashConfig, SessionClaims, DataStore, ServerPluginManifest } from "@openleash/core";
import {
    renderDashboard,
    renderOwners,
    renderOwnerDetail,
    renderAgents,
    renderPolicies,
    renderPolicyViewer,
    renderConfig,
    renderAudit,
    renderOwnerLogin,
    renderOwnerSetup,
    renderOwnerDashboard,
    renderOwnerApprovals,
    renderOwnerAgents,
    renderOwnerPolicies,
    renderOwnerPolicyCreate,
    renderOwnerProfile,
    renderInitialSetup,
    renderApiReference,
    renderApiReferenceUnavailable,
    renderAbout,
    renderAdminOrganizations,
    renderAdminOrganizationDetail,
    renderOwnerOrganizations,
    renderOwnerOrganizationDetail,
    setVersion,
} from "@openleash/gui";
import type { PackageInfo } from "@openleash/gui";
import { createAdminAuth } from "../middleware/admin-auth.js";
import { createOwnerAuth } from "../middleware/owner-auth.js";
import { getVersion, getVersionInfo } from "../version.js";
import { bootstrapState } from "../bootstrap.js";

export interface GuiRoutesOptions {
    hasApiReference?: boolean;
    pluginManifest?: ServerPluginManifest;
}

/**
 * Scan node_modules for installed @openleash/* packages and return
 * their names and versions. Walks up from both __dirname and process.cwd()
 * to find the node_modules/@openleash directory.
 */
function discoverOpenleashPackages(): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const seen = new Set<string>();

    function scanDir(startDir: string) {
        let dir = startDir;
        for (let i = 0; i < 10; i++) {
            const nmDir = path.join(dir, "node_modules", "@openleash");
            if (fs.existsSync(nmDir)) {
                try {
                    for (const entry of fs.readdirSync(nmDir, { withFileTypes: true })) {
                        if (!entry.isDirectory()) continue;
                        const pkgPath = path.join(nmDir, entry.name, "package.json");
                        try {
                            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name?: string; version?: string };
                            if (pkg.name && pkg.version && !seen.has(pkg.name)) {
                                seen.add(pkg.name);
                                packages.push({ name: pkg.name, version: pkg.version });
                            }
                        } catch { /* skip */ }
                    }
                } catch { /* skip */ }
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    }

    scanDir(__dirname);
    scanDir(process.cwd());
    return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export function registerGuiRoutes(
    app: FastifyInstance,
    dataDir: string,
    store: DataStore,
    config: OpenleashConfig,
    options?: GuiRoutesOptions,
) {
    const vinfo = getVersionInfo();
    setVersion(vinfo.version, vinfo.commitHash ?? undefined);
    const adminAuth = createAdminAuth(config, store, options?.pluginManifest);
    const rootDir = path.dirname(dataDir);
    const statePath = path.join(dataDir, "state.md");
    const isHosted = config.instance?.mode === "hosted";
    const pluginManifest = options?.pluginManifest;
    const verificationProviderIds = pluginManifest?.verificationProviders?.map((p) => p.provider_id);
    const baseRenderOptions = isHosted
        ? {
            showContextSwitcher: false,
            extraUserNavItems: pluginManifest?.userNavItems,
            extraAdminNavItems: pluginManifest?.adminNavItems,
            verificationProviders: verificationProviderIds,
            isHosted: true,
            extraHeadHtml: pluginManifest?.extraHeadHtml,
            extraBodyHtml: pluginManifest?.extraBodyHtml,
        }
        : pluginManifest
            ? {
                extraUserNavItems: pluginManifest.userNavItems,
                extraAdminNavItems: pluginManifest.adminNavItems,
                verificationProviders: verificationProviderIds,
                extraHeadHtml: pluginManifest?.extraHeadHtml,
                extraBodyHtml: pluginManifest?.extraBodyHtml,
            }
            : undefined;

    /** Build render options with isAdmin from session claims. */
    function ownerRenderOptionsFor(session: SessionClaims) {
        const hasAdminRole = (session.system_roles ?? []).includes("admin");
        return baseRenderOptions
            ? { ...baseRenderOptions, isAdmin: hasAdminRole }
            : hasAdminRole ? { isAdmin: true } : undefined;
    }


    // Guard: if the data directory or state file is missing, re-bootstrap and
    // redirect to the initial setup page so the user can start fresh.
    app.addHook("onRequest", async (request, reply) => {
        if (!fs.existsSync(statePath)) {
            bootstrapState(rootDir);
            // Let setup-related and admin routes through without redirect
            const url = request.url.split("?")[0];
            if (url === "/gui" || url === "/gui/setup" || url.startsWith("/gui/admin")) return;
            reply.redirect("/gui");
        }
    });

    // Redirect /gui — if no owners, go to setup; otherwise owner dashboard
    if (!pluginManifest?.handlesRootPath) {
        app.get("/gui", async (_request, reply) => {
            const state = store.state.getState();
            if (!isHosted && state.users.length === 0) {
                reply.redirect("/gui/setup");
                return;
            }
            reply.redirect("/gui/dashboard");
        });
    }

    // Initial setup page (no auth) — disabled in hosted mode
    app.get("/gui/setup", async (_request, reply) => {
        if (isHosted) {
            reply.redirect("/gui/login");
            return;
        }
        const state = store.state.getState();
        if (state.users.length > 0) {
            reply.redirect("/gui/dashboard");
            return;
        }
        const html = renderInitialSetup();
        reply.type("text/html").send(html);
    });

    // ─── Admin GUI routes ─────────────────────────────────────────────

    // Redirect /gui/admin to admin dashboard
    app.get("/gui/admin", async (_request, reply) => {
        reply.redirect("/gui/admin/dashboard");
    });

    // Admin login — redirect to unified owner login
    app.get("/gui/admin/login", async (_request, reply) => {
        reply.redirect("/gui/login?redirect=/gui/admin/dashboard");
    });

    // Dashboard
    app.get("/gui/admin/dashboard", { preHandler: adminAuth }, async (_request, reply) => {
        const state = store.state.getState();
        const stateData = {
            version: state.version,
            created_at: state.created_at,
            counts: {
                owners: state.users.length,
                agents: state.agents.length,
                policies: state.policies.length,
                bindings: state.bindings.length,
                keys: state.server_keys.keys.length,
            },
            active_kid: state.server_keys.active_kid,
        };

        const html = renderDashboard({
            state: stateData,
            health: { status: "ok", version: getVersion() },
        });
        reply.type("text/html").send(html);
    });

    // Redirect old /gui/admin/owners to /gui/admin/users
    app.get("/gui/admin/owners", { preHandler: adminAuth }, async (_request, reply) => {
        reply.redirect("/gui/admin/users");
    });
    app.get("/gui/admin/owners/:ownerId", { preHandler: adminAuth }, async (request, reply) => {
        const { ownerId } = request.params as { ownerId: string };
        reply.redirect(`/gui/admin/users/${ownerId}`);
    });

    // Users
    app.get("/gui/admin/users", { preHandler: adminAuth }, async (_request, reply) => {
        const state = store.state.getState();
        const owners = state.users.map((entry) => {
            try {
                const user = store.users.read(entry.user_principal_id);
                return {
                    user_principal_id: user.user_principal_id,
                    display_name: user.display_name,
                    status: user.status,
                    attributes: user.attributes,
                    created_at: user.created_at,
                    identity_assurance_level: user.identity_assurance_level,
                    contact_identities: user.contact_identities,
                    government_ids: user.government_ids,
                    totp_enabled: user.totp_enabled,
                    totp_enabled_at: user.totp_enabled_at,
                    has_passphrase: !!user.passphrase_hash,
                    system_roles: resolveSystemRoles(user) as string[],
                };
            } catch {
                return {
                    user_principal_id: entry.user_principal_id,
                    error: "file_not_found",
                } as { user_principal_id: string; error: string };
            }
        });
        const html = renderOwners(owners);
        reply.type("text/html").send(html);
    });

    // User detail
    app.get("/gui/admin/users/:ownerId", { preHandler: adminAuth }, async (request, reply) => {
        const { ownerId } = request.params as { ownerId: string };
        const query = request.query as { activity_page?: string; activity_page_size?: string };
        const activityPageSize = Math.min(Math.max(parseInt(query.activity_page_size || "25", 10) || 25, 1), 100);
        const activityPage = Math.max(parseInt(query.activity_page || "1", 10) || 1, 1);
        const activityOffset = (activityPage - 1) * activityPageSize;
        const state = store.state.getState();
        const entry = state.users.find((o) => o.user_principal_id === ownerId);

        if (!entry) {
            reply.code(404).type("text/html").send("<h1>Owner not found</h1>");
            return;
        }

        try {
            const user = store.users.read(ownerId);

            // Agents belonging to this owner (user)
            const agents = state.agents
                .filter((a) => a.owner_type === "user" && a.owner_id === ownerId)
                .map((a) => {
                    try {
                        const agent = store.agents.read(a.agent_principal_id);
                        return {
                            agent_id: agent.agent_id,
                            agent_principal_id: agent.agent_principal_id,
                            status: agent.status,
                            created_at: agent.created_at,
                        };
                    } catch {
                        return {
                            agent_id: a.agent_id,
                            agent_principal_id: a.agent_principal_id,
                            status: "UNKNOWN",
                            created_at: "",
                        };
                    }
                });

            // Policies for this owner (user)
            const policies = state.policies
                .filter((p) => p.owner_type === "user" && p.owner_id === ownerId)
                .map((p) => ({
                    policy_id: p.policy_id,
                    applies_to_agent_principal_id: p.applies_to_agent_principal_id,
                }));

            // Activity log for this owner
            const ownerAgentIds = new Set(
                state.agents
                    .filter((a) => a.owner_type === "user" && a.owner_id === ownerId)
                    .map((a) => a.agent_principal_id),
            );
            const activityResult = store.audit.readByPrincipal(ownerId, ownerAgentIds, activityPageSize, activityOffset);

            const linkedHumans: { user_principal_id: string; display_name: string }[] = [];

            const ownerWithMeta = {
                user_principal_id: user.user_principal_id,
                display_name: user.display_name,
                status: user.status,
                attributes: user.attributes,
                created_at: user.created_at,
                identity_assurance_level: user.identity_assurance_level,
                contact_identities: user.contact_identities,
                government_ids: user.government_ids,
                totp_enabled: user.totp_enabled,
                totp_enabled_at: user.totp_enabled_at,
                has_passphrase: !!user.passphrase_hash,
                system_roles: resolveSystemRoles(user) as string[],
            };
            const html = renderOwnerDetail({
                owner: ownerWithMeta,
                agents,
                policies,
                activity_log: {
                    items: activityResult.items,
                    total: activityResult.total,
                    page: activityPage,
                    pageSize: activityPageSize,
                },
                linked_humans: linkedHumans,
            });
            reply.type("text/html").send(html);
        } catch {
            reply.code(404).type("text/html").send("<h1>Owner file not found</h1>");
        }
    });

    // Organizations
    type OrgContactIdentity = { contact_id: string; type: string; value: string; verified: boolean };
    type OrgCompanyId = { id_type: string; id_value: string; country?: string; verification_level: string };

    app.get("/gui/admin/organizations", { preHandler: adminAuth }, async (_request, reply) => {
        const state = store.state.getState();
        const orgs = state.organizations.map((entry) => {
            try {
                const org = store.organizations.read(entry.org_id);
                const memberCount = store.memberships.listByOrg(entry.org_id).length;
                const agentCount = state.agents.filter(
                    (a) => a.owner_type === "org" && a.owner_id === entry.org_id,
                ).length;
                return {
                    org_id: org.org_id,
                    display_name: org.display_name,
                    status: org.status,
                    created_at: org.created_at,
                    created_by_user_id: org.created_by_user_id,
                    verification_status: org.verification_status,
                    member_count: memberCount,
                    agent_count: agentCount,
                };
            } catch {
                return { org_id: entry.org_id, member_count: 0, agent_count: 0, error: "file_not_found" };
            }
        });
        const html = renderAdminOrganizations(orgs);
        reply.type("text/html").send(html);
    });

    // Organization detail
    app.get("/gui/admin/organizations/:orgId", { preHandler: adminAuth }, async (request, reply) => {
        const { orgId } = request.params as { orgId: string };
        const state = store.state.getState();
        const entry = state.organizations.find((o) => o.org_id === orgId);
        if (!entry) {
            reply.code(404).type("text/html").send("<h1>Organization not found</h1>");
            return;
        }

        try {
            const org = store.organizations.read(orgId);
            const members = store.memberships.listByOrg(orgId).map((m) => {
                try {
                    const user = store.users.read(m.user_principal_id);
                    return {
                        membership_id: m.membership_id,
                        user_principal_id: m.user_principal_id,
                        display_name: user.display_name,
                        role: m.role,
                        status: m.status,
                        created_at: m.created_at,
                    };
                } catch {
                    return {
                        membership_id: m.membership_id,
                        user_principal_id: m.user_principal_id,
                        display_name: null as string | null,
                        role: m.role,
                        status: m.status,
                        created_at: m.created_at,
                    };
                }
            });
            const agents = state.agents
                .filter((a) => a.owner_type === "org" && a.owner_id === orgId)
                .map((a) => {
                    try {
                        const agent = store.agents.read(a.agent_principal_id);
                        return {
                            agent_id: agent.agent_id,
                            agent_principal_id: agent.agent_principal_id,
                            status: agent.status,
                            created_at: agent.created_at,
                        };
                    } catch {
                        return { agent_id: a.agent_id, agent_principal_id: a.agent_principal_id, status: "UNKNOWN", created_at: "" };
                    }
                });
            const policies = state.policies
                .filter((p) => p.owner_type === "org" && p.owner_id === orgId)
                .map((p) => ({
                    policy_id: p.policy_id,
                    applies_to_agent_principal_id: p.applies_to_agent_principal_id,
                    name: p.name,
                }));

            const html = renderAdminOrganizationDetail({
                org: {
                    org_id: org.org_id,
                    display_name: org.display_name,
                    status: org.status,
                    created_at: org.created_at,
                    created_by_user_id: org.created_by_user_id,
                    verification_status: org.verification_status,
                    member_count: members.length,
                    agent_count: agents.length,
                    contact_identities: org.contact_identities as OrgContactIdentity[] | undefined,
                    company_ids: org.company_ids as OrgCompanyId[] | undefined,
                    domains: org.domains as { domain_id: string; domain: string; verification_level: string }[] | undefined,
                    identity_assurance_level: org.identity_assurance_level,
                },
                members,
                agents,
                policies,
            });
            reply.type("text/html").send(html);
        } catch {
            reply.code(404).type("text/html").send("<h1>Organization file not found</h1>");
        }
    });

    // Agents
    app.get("/gui/admin/agents", { preHandler: adminAuth }, async (_request, reply) => {
        const state = store.state.getState();
        const agents = state.agents.map((entry) => {
            try {
                const agent = store.agents.read(entry.agent_principal_id);
                return {
                    agent_principal_id: agent.agent_principal_id,
                    agent_id: agent.agent_id,
                    owner_type: entry.owner_type,
                    owner_id: entry.owner_id,
                    status: agent.status,
                    created_at: agent.created_at,
                    revoked_at: agent.revoked_at,
                    webhook_url: agent.webhook_url,
                };
            } catch {
                return {
                    agent_principal_id: entry.agent_principal_id,
                    agent_id: entry.agent_id,
                    owner_type: entry.owner_type,
                    owner_id: entry.owner_id,
                    status: "UNKNOWN",
                    created_at: "",
                    revoked_at: null,
                    webhook_url: "",
                    error: "file_not_found",
                };
            }
        });
        const userOwners = state.users.map((entry) => {
            try {
                const u = store.users.read(entry.user_principal_id);
                return { id: u.user_principal_id, display_name: u.display_name, type: "user" as const };
            } catch {
                return { id: entry.user_principal_id, display_name: entry.user_principal_id.slice(0, 8), type: "user" as const };
            }
        });
        const orgOwners = state.organizations.map((entry) => {
            try {
                const o = store.organizations.read(entry.org_id);
                return { id: o.org_id, display_name: o.display_name, type: "org" as const };
            } catch {
                return { id: entry.org_id, display_name: entry.org_id.slice(0, 8), type: "org" as const };
            }
        });
        const html = renderAgents(agents, [...userOwners, ...orgOwners]);
        reply.type("text/html").send(html);
    });

    // Policies list
    app.get("/gui/admin/policies", { preHandler: adminAuth }, async (_request, reply) => {
        const state = store.state.getState();
        const policies = state.policies.map((entry) => {
            const base = {
                policy_id: entry.policy_id,
                owner_type: entry.owner_type,
                owner_id: entry.owner_id,
                applies_to_agent_principal_id: entry.applies_to_agent_principal_id,
                name: entry.name,
                description: entry.description,
            };
            try {
                const yaml = store.policies.read(entry.policy_id);
                return { ...base, policy_yaml: yaml };
            } catch {
                return { ...base, error: "file_not_found" };
            }
        });

        const html = renderPolicies(policies);
        reply.type("text/html").send(html);
    });

    // Policy viewer
    app.get("/gui/admin/policies/:policyId", { preHandler: adminAuth }, async (request, reply) => {
        const { policyId } = request.params as { policyId: string };
        const state = store.state.getState();
        const entry = state.policies.find((p) => p.policy_id === policyId);

        if (!entry) {
            reply.code(404).type("text/html").send("<h1>Policy not found</h1>");
            return;
        }

        try {
            const yaml = store.policies.read(policyId);
            const ownerNames = new Map(
                state.users.map((o) => {
                    try {
                        return [
                            o.user_principal_id,
                            store.users.read(o.user_principal_id).display_name,
                        ] as const;
                    } catch {
                        return [o.user_principal_id, undefined] as const;
                    }
                }),
            );
            const agentNames = new Map(state.agents.map((a) => [a.agent_principal_id, a.agent_id]));
            const bindingsForRender = state.bindings.map((b) => ({
                owner_type: b.owner_type,
                owner_id: b.owner_id,
                policy_id: b.policy_id,
                applies_to_agent_principal_id: b.applies_to_agent_principal_id,
            }));
            const html = renderPolicyViewer(
                {
                    policy_id: policyId,
                    owner_type: entry.owner_type,
                    owner_id: entry.owner_id,
                    applies_to_agent_principal_id: entry.applies_to_agent_principal_id,
                    name: entry.name ?? null,
                    description: entry.description ?? null,
                    policy_yaml: yaml,
                },
                bindingsForRender,
                { owners: ownerNames as Map<string, string>, agents: agentNames },
            );
            reply.type("text/html").send(html);
        } catch {
            reply.code(404).type("text/html").send("<h1>Policy file not found</h1>");
        }
    });

    // Config
    app.get("/gui/admin/config", { preHandler: adminAuth }, async (_request, reply) => {
        const configData = {
            server: config.server,
            admin: {
                mode: config.admin.mode,
                token_set: !!config.admin.token,
                allow_remote_admin: config.admin.allow_remote_admin,
            },
            security: config.security,
            tokens: config.tokens,
            gui: config.gui,
        };
        const html = renderConfig(configData);
        reply.type("text/html").send(html);
    });

    // Audit log
    app.get("/gui/admin/audit", { preHandler: adminAuth }, async (request, reply) => {
        const query = request.query as { page?: string; page_size?: string };
        const pageSize = Math.min(Math.max(parseInt(query.page_size || "25", 10) || 25, 1), 100);
        const page = Math.max(parseInt(query.page || "1", 10) || 1, 1);
        const cursor = (page - 1) * pageSize;
        const data = store.audit.readPage(pageSize, cursor);
        const state = store.state.getState();
        const ownerNames = new Map(
            state.users.map((o) => {
                try {
                    return [
                        o.user_principal_id,
                        store.users.read(o.user_principal_id).display_name,
                    ] as const;
                } catch {
                    return [o.user_principal_id, undefined] as const;
                }
            }),
        );
        const agentNames = new Map(state.agents.map((a) => [a.agent_principal_id, a.agent_id]));
        const eventTypes = [...new Set(data.items.map((e) => e.event_type))].sort();
        const nextCursor = cursor + pageSize < data.total ? String(cursor + pageSize) : null;
        const html = renderAudit({ ...data, next_cursor: nextCursor }, page, pageSize, {
            owners: ownerNames as Map<string, string>,
            agents: agentNames,
            eventTypes,
        });
        reply.type("text/html").send(html);
    });

    // API Reference (embedded Scalar)
    app.get("/gui/admin/api-reference", { preHandler: adminAuth }, async (_request, reply) => {
        const html = options?.hasApiReference
            ? renderApiReference()
            : renderApiReferenceUnavailable();
        reply.type("text/html").send(html);
    });

    // About — version and installed packages
    app.get("/gui/admin/about", { preHandler: adminAuth }, async (_request, reply) => {
        const packages = discoverOpenleashPackages();
        const html = renderAbout({
            version: vinfo.version,
            commitHash: vinfo.commitHash,
            nodeVersion: process.version,
            packages,
        });
        reply.type("text/html").send(html);
    });

    // ─── Owner GUI routes ─────────────────────────────────────────────

    const ownerAuth = createOwnerAuth(config, store, pluginManifest);

    // Login page (no auth) — skipped if plugin replaces it
    if (!pluginManifest?.replacesUserLogin) {
        app.get("/gui/login", async (_request, reply) => {
            const html = renderOwnerLogin(isHosted ? { hosted: true } : undefined);
            reply.type("text/html").send(html);
        });
    }

    // Setup page (no auth — invite token acts as proof)
    app.get("/gui/owner-setup", async (_request, reply) => {
        const html = renderOwnerSetup();
        reply.type("text/html").send(html);
    });

    // Owner dashboard
    app.get("/gui/dashboard", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const state = store.state.getState();
        const user = store.users.read(session.sub);

        const agentCount = state.agents.filter((a) => a.owner_type === "user" && a.owner_id === session.sub).length;
        const policyCount = state.policies.filter(
            (p) => p.owner_type === "user" && p.owner_id === session.sub,
        ).length;
        const pendingApprovals = (state.approval_requests ?? []).filter(
            (r) => r.owner_type === "user" && r.owner_id === session.sub && r.status === "PENDING",
        ).length;
        const pendingPolicyDrafts = (state.policy_drafts ?? []).filter(
            (d) => d.owner_type === "user" && d.owner_id === session.sub && d.status === "PENDING",
        ).length;

        const html = renderOwnerDashboard({
            display_name: user.display_name,
            agent_count: agentCount,
            policy_count: policyCount,
            pending_approvals: pendingApprovals,
            pending_policy_drafts: pendingPolicyDrafts,
        }, ownerRenderOptionsFor(session));
        reply.type("text/html").send(html);
    });

    // Owner organizations
    app.get("/gui/organizations", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const memberships = store.memberships.listByUser(session.sub);
        const orgs = memberships
            .filter((m) => m.status === "active")
            .map((m) => {
                try {
                    const org = store.organizations.read(m.org_id);
                    return {
                        org_id: org.org_id,
                        display_name: org.display_name,
                        status: org.status,
                        role: m.role,
                        created_at: org.created_at,
                        verification_status: org.verification_status,
                    };
                } catch {
                    return { org_id: m.org_id, role: m.role, error: "file_not_found" };
                }
            });
        // Get pending org invites for the user
        const pendingInvites = store.orgInvites.listByUser(session.sub)
            .filter((i) => i.status === "pending" && new Date(i.expires_at) > new Date())
            .map((i) => {
                try {
                    const org = store.organizations.read(i.org_id);
                    const inviter = store.users.read(i.invited_by_user_id);
                    return {
                        invite_id: i.invite_id,
                        org_id: i.org_id,
                        org_display_name: org.display_name,
                        role: i.role,
                        invited_by_name: inviter.display_name,
                        expires_at: i.expires_at,
                    };
                } catch {
                    return {
                        invite_id: i.invite_id,
                        org_id: i.org_id,
                        org_display_name: null as string | null,
                        role: i.role,
                        invited_by_name: null as string | null,
                        expires_at: i.expires_at,
                    };
                }
            });
        const html = renderOwnerOrganizations(orgs, ownerRenderOptionsFor(session), pendingInvites);
        reply.type("text/html").send(html);
    });

    // Owner organization detail
    app.get("/gui/organizations/:orgId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        // Verify user is a member of this org
        const memberships = store.memberships.listByUser(session.sub);
        const membership = memberships.find((m) => m.org_id === orgId && m.status === "active");
        if (!membership) {
            reply.code(404).type("text/html").send("<h1>Organization not found</h1>");
            return;
        }

        try {
            const org = store.organizations.read(orgId);
            const allMembers = store.memberships.listByOrg(orgId).map((m) => {
                try {
                    const user = store.users.read(m.user_principal_id);
                    return {
                        display_name: user.display_name,
                        user_principal_id: m.user_principal_id,
                        role: m.role,
                        created_at: m.created_at,
                    };
                } catch {
                    return {
                        display_name: null as string | null,
                        user_principal_id: m.user_principal_id,
                        role: m.role,
                        created_at: m.created_at,
                    };
                }
            });

            const state = store.state.getState();
            const orgAgents = state.agents
                .filter((a) => a.owner_type === "org" && a.owner_id === orgId)
                .map((a) => {
                    try {
                        const agent = store.agents.read(a.agent_principal_id);
                        return {
                            agent_id: agent.agent_id,
                            agent_principal_id: agent.agent_principal_id,
                            status: agent.status,
                            created_at: agent.created_at,
                        };
                    } catch {
                        return { agent_id: a.agent_id, agent_principal_id: a.agent_principal_id, status: "UNKNOWN", created_at: "" };
                    }
                });
            const orgPolicies = state.policies
                .filter((p) => p.owner_type === "org" && p.owner_id === orgId)
                .map((p) => ({
                    policy_id: p.policy_id,
                    applies_to_agent_principal_id: p.applies_to_agent_principal_id,
                    name: p.name,
                }));

            const html = renderOwnerOrganizationDetail({
                org: {
                    org_id: org.org_id,
                    display_name: org.display_name,
                    status: org.status,
                    role: membership.role,
                    created_at: org.created_at,
                    verification_status: org.verification_status,
                    identity_assurance_level: org.identity_assurance_level,
                    company_ids: org.company_ids as { id_type: string; id_value: string; country?: string; verification_level: string }[] | undefined,
                    contact_identities: org.contact_identities as { contact_id: string; type: string; value: string; verified: boolean }[] | undefined,
                    domains: org.domains as { domain_id: string; domain: string; verification_level: string }[] | undefined,
                    member_count: allMembers.length,
                    agent_count: orgAgents.length,
                },
                members: allMembers,
                agents: orgAgents,
                policies: orgPolicies,
                pendingInvites: store.orgInvites.listByOrg(orgId)
                    .filter((i) => i.status === "pending" && new Date(i.expires_at) > new Date())
                    .map((i) => {
                        try {
                            const u = store.users.read(i.user_principal_id);
                            return { invite_id: i.invite_id, user_principal_id: i.user_principal_id, display_name: u.display_name, role: i.role, expires_at: i.expires_at, created_at: i.created_at };
                        } catch {
                            return { invite_id: i.invite_id, user_principal_id: i.user_principal_id, display_name: null as string | null, role: i.role, expires_at: i.expires_at, created_at: i.created_at };
                        }
                    }),
                currentUserId: session.sub,
            }, ownerRenderOptionsFor(session));
            reply.type("text/html").send(html);
        } catch {
            reply.code(404).type("text/html").send("<h1>Organization file not found</h1>");
        }
    });

    // Owner agents
    app.get("/gui/agents", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const state = store.state.getState();
        const agents = state.agents
            .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
            .map((entry) => {
                try {
                    const agent = store.agents.read(entry.agent_principal_id);
                    return {
                        agent_principal_id: agent.agent_principal_id,
                        agent_id: agent.agent_id,
                        status: agent.status,
                        created_at: agent.created_at,
                        revoked_at: agent.revoked_at,
                        webhook_url: agent.webhook_url,
                    };
                } catch {
                    return {
                        agent_principal_id: entry.agent_principal_id,
                        agent_id: entry.agent_id,
                        status: "UNKNOWN",
                        created_at: "",
                        revoked_at: null,
                        webhook_url: "",
                    };
                }
            });
        const agentOwner = store.users.read(session.sub);

        // Build owner options (self + orgs where user is admin)
        const ownerOptions: { id: string; display_name: string; type: "user" | "org" }[] = [
            { id: session.sub, display_name: agentOwner.display_name, type: "user" },
        ];
        const userMemberships = store.memberships.listByUser(session.sub);
        for (const m of userMemberships) {
            if (m.status !== "active") continue;
            try {
                const org = store.organizations.read(m.org_id);
                ownerOptions.push({ id: org.org_id, display_name: org.display_name, type: "org" });
            } catch { /* skip */ }
        }

        const html = renderOwnerAgents(agents, {
            totp_enabled: !!agentOwner.totp_enabled,
            require_totp: !!config.security.require_totp,
            ownerOptions: ownerOptions.length > 1 ? ownerOptions : undefined,
        }, ownerRenderOptionsFor(session));
        reply.type("text/html").send(html);
    });

    // Owner policies (includes policy drafts)
    app.get("/gui/policies", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const state = store.state.getState();
        const policies = state.policies
            .filter((p) => p.owner_type === "user" && p.owner_id === session.sub)
            .map((entry) => {
                try {
                    const yaml = store.policies.read(entry.policy_id);
                    return {
                        policy_id: entry.policy_id,
                        applies_to_agent_principal_id: entry.applies_to_agent_principal_id,
                        name: entry.name ?? null,
                        description: entry.description ?? null,
                        policy_yaml: yaml,
                    };
                } catch {
                    return {
                        policy_id: entry.policy_id,
                        applies_to_agent_principal_id: entry.applies_to_agent_principal_id,
                        name: entry.name ?? null,
                        description: entry.description ?? null,
                    };
                }
            });
        const draftEntries = (state.policy_drafts ?? []).filter(
            (d) => d.owner_type === "user" && d.owner_id === session.sub,
        );
        const drafts = draftEntries.map((entry) => {
            try {
                const draft = store.policyDrafts.read(entry.policy_draft_id);
                return {
                    policy_draft_id: draft.policy_draft_id,
                    agent_id: draft.agent_id,
                    agent_principal_id: draft.agent_principal_id,
                    applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
                    name: draft.name ?? null,
                    description: draft.description ?? null,
                    policy_yaml: draft.policy_yaml,
                    justification: draft.justification,
                    status: draft.status,
                    resulting_policy_id: draft.resulting_policy_id,
                    denial_reason: draft.denial_reason,
                    created_at: draft.created_at,
                    resolved_at: draft.resolved_at,
                };
            } catch {
                return {
                    policy_draft_id: entry.policy_draft_id,
                    agent_id: "unknown",
                    agent_principal_id: entry.agent_principal_id,
                    applies_to_agent_principal_id: null,
                    name: null,
                    description: null,
                    policy_yaml: "",
                    justification: null,
                    status: entry.status,
                    resulting_policy_id: null,
                    denial_reason: null,
                    created_at: "",
                    resolved_at: null,
                };
            }
        });
        const agentNames = new Map(
            state.agents
                .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
                .map((a) => [a.agent_principal_id, a.agent_id]),
        );
        const policyOwner = store.users.read(session.sub);
        const html = renderOwnerPolicies(policies, drafts, {
            totp_enabled: !!policyOwner.totp_enabled,
            require_totp: !!config.security.require_totp,
            agent_names: agentNames,
        }, ownerRenderOptionsFor(session));
        reply.type("text/html").send(html);
    });

    // Owner create policy
    app.get("/gui/policies/create", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const html = renderOwnerPolicyCreate(ownerRenderOptionsFor(session));
        reply.type("text/html").send(html);
    });

    // Owner approvals
    app.get("/gui/approvals", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const query = request.query as {
            pending_page?: string; pending_page_size?: string;
            resolved_page?: string; resolved_page_size?: string;
        };
        const pendingPageSize = Math.min(Math.max(parseInt(query.pending_page_size || "25", 10) || 25, 1), 100);
        const pendingPage = Math.max(parseInt(query.pending_page || "1", 10) || 1, 1);
        const resolvedPageSize = Math.min(Math.max(parseInt(query.resolved_page_size || "25", 10) || 25, 1), 100);
        const resolvedPage = Math.max(parseInt(query.resolved_page || "1", 10) || 1, 1);

        const state = store.state.getState();
        const approvalEntries = (state.approval_requests ?? []).filter(
            (r) => r.owner_type === "user" && r.owner_id === session.sub,
        );

        // Pending: filter from cached state, paginate from end (newest first), then read files
        const pendingEntries = approvalEntries.filter((e) => e.status === "PENDING");
        const pendingOffset = (pendingPage - 1) * pendingPageSize;
        const pendingStart = Math.max(pendingEntries.length - pendingOffset - pendingPageSize, 0);
        const pendingEnd = pendingEntries.length - pendingOffset;
        const pendingSlice = pendingEntries.slice(pendingStart, pendingEnd);

        // Resolved: use StateRepository for cached owner->resolved mapping
        const resolvedOffset = (resolvedPage - 1) * resolvedPageSize;
        const resolvedResult = store.state.getResolvedApprovals("user", session.sub, resolvedPageSize, resolvedOffset);

        function readEntry(entry: { approval_request_id: string; agent_principal_id: string; status: string }) {
            try {
                const req = store.approvalRequests.read(entry.approval_request_id);
                return {
                    approval_request_id: req.approval_request_id,
                    agent_id: req.agent_id,
                    agent_principal_id: entry.agent_principal_id,
                    action_type: req.action_type,
                    action_hash: req.action_hash ?? null,
                    decision_id: req.decision_id ?? null,
                    action: req.action ?? null,
                    context: req.context ?? null,
                    justification: req.justification,
                    status: req.status,
                    denial_reason: req.denial_reason ?? null,
                    created_at: req.created_at,
                    expires_at: req.expires_at,
                    resolved_at: req.resolved_at ?? null,
                };
            } catch {
                return {
                    approval_request_id: entry.approval_request_id,
                    agent_id: "unknown",
                    agent_principal_id: entry.agent_principal_id,
                    action_type: "unknown",
                    action_hash: null,
                    decision_id: null,
                    action: null,
                    context: null,
                    justification: null,
                    status: entry.status,
                    denial_reason: null,
                    created_at: "",
                    expires_at: "",
                    resolved_at: null,
                };
            }
        }

        const approvalOwner = store.users.read(session.sub);
        const approvalAgentNames = new Map(
            state.agents
                .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
                .map((a) => [a.agent_principal_id, a.agent_id]),
        );
        const html = renderOwnerApprovals({
            pending: { items: pendingSlice.map(readEntry), total: pendingEntries.length, page: pendingPage, pageSize: pendingPageSize },
            resolved: { items: resolvedResult.items.map(readEntry), total: resolvedResult.total, page: resolvedPage, pageSize: resolvedPageSize },
        }, {
            totp_enabled: !!approvalOwner.totp_enabled,
            require_totp: !!config.security.require_totp,
            agent_names: approvalAgentNames,
        }, ownerRenderOptionsFor(session));
        reply.type("text/html").send(html);
    });

    // Owner policy drafts — redirect to merged policies page
    app.get("/gui/policy-drafts", { preHandler: ownerAuth }, async (_request, reply) => {
        reply.redirect("/gui/policies");
    });

    // Owner profile
    app.get("/gui/profile", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const user = store.users.read(session.sub);

        const html = renderOwnerProfile({
            user_principal_id: user.user_principal_id,
            display_name: user.display_name,
            status: user.status,
            identity_assurance_level: user.identity_assurance_level,
            contact_identities: user.contact_identities,
            government_ids: user.government_ids,
            created_at: user.created_at,
            totp_enabled: !!user.totp_enabled,
            totp_enabled_at: user.totp_enabled_at,
            totp_backup_codes_remaining: user.totp_backup_codes_hash?.length,
        }, ownerRenderOptionsFor(session));
        reply.type("text/html").send(html);
    });

    // Owner audit
    app.get("/gui/audit", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const query = request.query as { page?: string; page_size?: string };
        const pageSize = Math.min(Math.max(parseInt(query.page_size || "25", 10) || 25, 1), 100);
        const page = Math.max(parseInt(query.page || "1", 10) || 1, 1);
        const state = store.state.getState();

        // Collect all related principal IDs: user's agents + org IDs + org agents
        const relatedIds = new Set<string>();

        // User's own agents
        state.agents
            .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
            .forEach((a) => relatedIds.add(a.agent_principal_id));

        // User's org memberships
        const userMemberships = store.memberships.listByUser(session.sub);
        const userOrgIds = userMemberships.filter((m) => m.status === "active").map((m) => m.org_id);

        for (const orgId of userOrgIds) {
            relatedIds.add(orgId); // Include org events
            // Include agents owned by the org
            state.agents
                .filter((a) => a.owner_type === "org" && a.owner_id === orgId)
                .forEach((a) => relatedIds.add(a.agent_principal_id));
        }

        // Apply filter from query string
        const filterScope = (request.query as Record<string, string>).scope;
        let filteredRelatedIds = relatedIds;
        let filterPrincipalId = session.sub;

        if (filterScope === "user") {
            // Only user's own events + user's own agents
            filteredRelatedIds = new Set(
                state.agents
                    .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
                    .map((a) => a.agent_principal_id),
            );
        } else if (filterScope && filterScope.startsWith("org:")) {
            const orgId = filterScope.slice(4);
            if (userOrgIds.includes(orgId)) {
                filterPrincipalId = orgId;
                filteredRelatedIds = new Set<string>();
                state.agents
                    .filter((a) => a.owner_type === "org" && a.owner_id === orgId)
                    .forEach((a) => filteredRelatedIds.add(a.agent_principal_id));
                filteredRelatedIds.add(session.sub); // include own actions on this org
            }
        } else if (filterScope && filterScope.startsWith("agent:")) {
            const agentPid = filterScope.slice(6);
            if (relatedIds.has(agentPid)) {
                filterPrincipalId = agentPid;
                filteredRelatedIds = new Set<string>();
            }
        }

        const offset = (page - 1) * pageSize;
        const data = store.audit.readByPrincipal(filterPrincipalId, filteredRelatedIds, pageSize, offset);

        const ownerNames = new Map<string, string>();
        ownerNames.set(session.sub, store.users.read(session.sub).display_name);
        for (const orgId of userOrgIds) {
            try {
                const org = store.organizations.read(orgId);
                ownerNames.set(orgId, org.display_name);
            } catch { /* skip */ }
        }

        const agentNames = new Map<string, string>();
        state.agents
            .filter((a) =>
                (a.owner_type === "user" && a.owner_id === session.sub) ||
                (a.owner_type === "org" && userOrgIds.includes(a.owner_id)),
            )
            .forEach((a) => agentNames.set(a.agent_principal_id, a.agent_id));

        const eventTypes = [...new Set(data.items.map((e) => e.event_type))].sort();

        // Build scope options for filter dropdown
        const scopeOptions: { value: string; label: string }[] = [
            { value: "", label: "All" },
            { value: "user", label: "My events" },
        ];
        for (const orgId of userOrgIds) {
            const orgName = ownerNames.get(orgId) || orgId.slice(0, 8);
            scopeOptions.push({ value: `org:${orgId}`, label: `Org: ${orgName}` });
        }
        for (const [agentPid, agentId] of agentNames) {
            scopeOptions.push({ value: `agent:${agentPid}`, label: `Agent: ${agentId}` });
        }

        const nextCursor = offset + pageSize < data.total ? String(offset + pageSize) : null;
        const html = renderAudit(
            { items: data.items, next_cursor: nextCursor, total: data.total },
            page,
            pageSize,
            { owners: ownerNames, agents: agentNames, eventTypes },
            "owner",
            ownerRenderOptionsFor(session),
            scopeOptions,
            filterScope || "",
        );
        reply.type("text/html").send(html);
    });
}
