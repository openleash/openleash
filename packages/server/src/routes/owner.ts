import * as crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
    parsePolicyYaml,
    deliverWebhook,
    issueSessionToken,
    issueApprovalToken,
    hashPassphrase,
    verifyPassphrase,
    validateUserIdentity,
    computeUserAssuranceLevel,
    generateTotpSecret,
    generateTotpUri,
    generateTotpQrSvg,
    verifyTotp,
    generateBackupCodes,
    verifyBackupCode,
    resolveSystemRoles,
    validateCompanyIdValue,
    validateDomainName,
    computeOrgAssuranceLevel,
} from "@openleash/core";
import {
    OrgRole,
} from "@openleash/core";
import type {
    OpenleashConfig,
    SessionClaims,
    ContactIdentity,
    GovernmentId,
    CompanyId,
    OrgDomain,
    DataStore,
    OrgMembership,
    OrgInvite,
    OpenleashEvents,
    ServerPluginManifest,
} from "@openleash/core";
import { createOwnerAuth } from "../middleware/owner-auth.js";
import { cascadeDeleteOrg, cascadeDeleteUser } from "../cascade.js";
import { validateBody } from "../validate.js";
import {
    InitialSetupSchema,
    UserSetupSchema,
    UserLoginSchema,
    TotpVerifySchema,
    SavePolicySchema,
} from "@openleash/gui";

export function registerOwnerRoutes(
    app: FastifyInstance,
    store: DataStore,
    config: OpenleashConfig,
    events: OpenleashEvents,
    pluginManifest?: ServerPluginManifest,
) {
    const ownerAuth = createOwnerAuth(config, store, pluginManifest);

    // ─── No-auth routes ───────────────────────────────────────────────

    // POST /v1/initial-setup — first-time setup: create the first owner
    app.post("/v1/initial-setup", async (request, reply) => {
        // Disabled in hosted mode — owners are created via admin API + invites
        if (config.instance?.mode === "hosted") {
            reply.code(403).send({
                error: { code: "NOT_AVAILABLE", message: "Initial setup is not available in hosted mode" },
            });
            return;
        }

        const body = validateBody(request.body, InitialSetupSchema, reply);
        if (!body) return;

        // Guard: only allowed when no users exist
        const state = store.state.getState();
        if (state.users.length > 0) {
            reply.code(403).send({
                error: {
                    code: "SETUP_ALREADY_COMPLETED",
                    message: "Initial setup has already been completed",
                },
            });
            return;
        }

        // Create the first user (always a human)
        const userId = crypto.randomUUID();
        const { hash, salt } = hashPassphrase(body.passphrase);

        store.users.write({
            user_principal_id: userId,
            display_name: body.display_name,
            status: "ACTIVE",
            attributes: {},
            created_at: new Date().toISOString(),
            passphrase_hash: hash,
            passphrase_salt: salt,
            passphrase_set_at: new Date().toISOString(),
            system_roles: ["admin"],
        });

        // Update state
        store.state.updateState(s => {
            s.users.push({
                user_principal_id: userId,
                path: `./users/${userId}.md`,
            });
        });

        store.audit.append("INITIAL_SETUP_COMPLETED", {
            user_principal_id: userId,
            display_name: body.display_name,
        });

        return {
            status: "setup_complete",
            user_principal_id: userId,
            display_name: body.display_name,
        };
    });

    // POST /v1/owner/setup — complete setup with invite token + passphrase
    app.post("/v1/owner/setup", async (request, reply) => {
        const body = validateBody(request.body, UserSetupSchema, reply);
        if (!body) return;

        // Load invite
        let invite;
        try {
            invite = store.setupInvites.read(body.invite_id);
        } catch {
            reply.code(404).send({
                error: { code: "INVITE_NOT_FOUND", message: "Setup invite not found" },
            });
            return;
        }

        // Check already used
        if (invite.used) {
            reply.code(400).send({
                error: { code: "INVITE_USED", message: "Setup invite has already been used" },
            });
            return;
        }

        // Check expiry
        if (new Date(invite.expires_at).getTime() < Date.now()) {
            reply.code(400).send({
                error: { code: "INVITE_EXPIRED", message: "Setup invite has expired" },
            });
            return;
        }

        // Verify invite token hash
        const { hash: computedHash } = hashPassphrase(body.invite_token, invite.token_salt);
        if (computedHash !== invite.token_hash) {
            reply.code(401).send({
                error: { code: "INVALID_INVITE_TOKEN", message: "Invalid invite token" },
            });
            return;
        }

        // Hash passphrase and store on user
        const { hash, salt } = hashPassphrase(body.passphrase);

        const user = store.users.read(invite.user_principal_id);
        user.passphrase_hash = hash;
        user.passphrase_salt = salt;
        user.passphrase_set_at = new Date().toISOString();
        store.users.write(user);

        // Mark invite as used
        invite.used = true;
        invite.used_at = new Date().toISOString();
        store.setupInvites.write(invite);

        store.audit.append("USER_SETUP_COMPLETED", {
            user_principal_id: invite.user_principal_id,
        });

        return {
            status: "setup_complete",
            user_principal_id: invite.user_principal_id,
        };
    });

    // POST /v1/owner/login
    app.post("/v1/owner/login", async (request, reply) => {
        const body = validateBody(request.body, UserLoginSchema, reply);
        if (!body) return;

        // Look up user
        const state = store.state.getState();
        const userEntry = state.users.find(
            (u) => u.user_principal_id === body.user_principal_id,
        );
        if (!userEntry) {
            reply.code(401).send({
                error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
            });
            return;
        }

        let owner;
        try {
            owner = store.users.read(body.user_principal_id);
        } catch {
            reply.code(401).send({
                error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
            });
            return;
        }

        if (owner.status !== "ACTIVE") {
            reply.code(401).send({
                error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
            });
            return;
        }

        if (!owner.passphrase_hash || !owner.passphrase_salt) {
            reply.code(401).send({
                error: { code: "SETUP_REQUIRED", message: "Owner has not completed setup" },
            });
            return;
        }

        // Verify passphrase
        if (!verifyPassphrase(body.passphrase, owner.passphrase_hash, owner.passphrase_salt)) {
            reply.code(401).send({
                error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
            });
            return;
        }

        // Issue session token
        const activeKey = store.keys.read(state.server_keys.active_kid);
        const ttl = config.sessions?.ttl_seconds ?? 28800;
        const systemRoles = resolveSystemRoles(owner);
        // Load org memberships for token claims
        const memberships = store.memberships.listByUser(body.user_principal_id);
        const orgMemberships = memberships
            .filter((m) => m.status === "active")
            .map((m) => ({ org_id: m.org_id, role: m.role }));

        const session = await issueSessionToken({
            key: activeKey,
            userPrincipalId: body.user_principal_id,
            ttlSeconds: ttl,
            systemRoles,
            orgMemberships: orgMemberships.length > 0 ? orgMemberships : undefined,
        });

        store.audit.append("USER_LOGIN", {
            user_principal_id: body.user_principal_id,
            display_name: owner.display_name,
        });

        return {
            token: session.token,
            expires_at: session.expiresAt,
            user_principal_id: body.user_principal_id,
            system_roles: systemRoles,
            org_memberships: orgMemberships,
        };
    });

    // POST /v1/owner/logout
    app.post("/v1/owner/logout", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;

        store.audit.append("USER_LOGOUT", {
            user_principal_id: session.sub,
        });

        return { status: "logged_out" };
    });

    // POST /v1/owner/session/refresh — re-issue token with current memberships
    app.post("/v1/owner/session/refresh", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;

        const user = store.users.read(session.sub);
        const systemRoles = resolveSystemRoles(user);
        const memberships = store.memberships.listByUser(session.sub);
        const orgMemberships = memberships
            .filter((m) => m.status === "active")
            .map((m) => ({ org_id: m.org_id, role: m.role }));

        // Plugin-authenticated sessions (e.g. Firebase) — the external
        // auth provider handles token refresh, so return current info
        // without issuing a new PASETO.
        if (session.iss === "openleash:plugin") {
            return {
                user_principal_id: session.sub,
                system_roles: systemRoles,
                org_memberships: orgMemberships,
            };
        }

        const state = store.state.getState();
        const activeKey = store.keys.read(state.server_keys.active_kid);
        const ttl = config.sessions?.ttl_seconds ?? 28800;

        const newSession = await issueSessionToken({
            key: activeKey,
            userPrincipalId: session.sub,
            ttlSeconds: ttl,
            systemRoles,
            orgMemberships: orgMemberships.length > 0 ? orgMemberships : undefined,
        });

        return {
            token: newSession.token,
            expires_at: newSession.expiresAt,
            user_principal_id: session.sub,
            system_roles: systemRoles,
            org_memberships: orgMemberships,
        };
    });

    // ─── Owner-authed routes ──────────────────────────────────────────

    // GET /v1/owner/profile
    app.get("/v1/owner/profile", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const user = store.users.read(session.sub);

        // Strip sensitive fields
        const {
            passphrase_hash: _hash,
            passphrase_salt: _salt,
            totp_secret_b32: _secret,
            totp_backup_codes_hash: _codes,
            ...safeUser
        } = user;
        return { ...safeUser, totp_enabled: !!user.totp_enabled };
    });

    // PUT /v1/owner/profile
    app.put("/v1/owner/profile", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const body = request.body as {
            display_name?: string;
            contact_identities?: ContactIdentity[];
            government_ids?: GovernmentId[];
        };

        const user = store.users.read(session.sub);

        if (body.display_name !== undefined) user.display_name = body.display_name;
        if (body.contact_identities !== undefined) {
            user.contact_identities = body.contact_identities.map((c) => ({
                ...c,
                contact_id: c.contact_id || crypto.randomUUID(),
                verified: c.verified ?? false,
                verified_at: c.verified_at ?? null,
                added_at: c.added_at || new Date().toISOString(),
            }));
        }
        if (body.government_ids !== undefined) user.government_ids = body.government_ids;

        const validation = validateUserIdentity(user);
        if (validation.type_errors.length > 0) {
            reply.code(400).send({
                error: { code: "INVALID_IDENTITY", message: validation.type_errors.join("; ") },
            });
            return;
        }

        user.identity_assurance_level = computeUserAssuranceLevel(user);
        store.users.write(user);

        store.audit.append("USER_UPDATED", {
            user_principal_id: session.sub,
        });

        const { passphrase_hash: _hash, passphrase_salt: _salt, ...safeUser } = user;
        return safeUser;
    });

    // ─── Agents (scoped to owner) ─────────────────────────────────────

    // GET /v1/owner/agents
    app.get("/v1/owner/agents", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const state = store.state.getState();
        const agents = state.agents
            .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
            .map((entry) => {
                try {
                    return store.agents.read(entry.agent_principal_id);
                } catch {
                    return {
                        agent_principal_id: entry.agent_principal_id,
                        agent_id: entry.agent_id,
                        error: "file_not_found",
                    };
                }
            });
        return { agents };
    });

    // PUT /v1/owner/agents/:agentId
    app.put("/v1/owner/agents/:agentId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { agentId } = request.params as { agentId: string };
        const body = request.body as { status: "ACTIVE" | "REVOKED"; totp_code?: string };

        const state = store.state.getState();
        const agentEntry = state.agents.find(
            (a) => a.agent_principal_id === agentId && a.owner_type === "user" && a.owner_id === session.sub,
        );

        if (!agentEntry) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Agent not found" },
            });
            return;
        }

        // Require 2FA when revoking an agent
        if (body.status === "REVOKED") {
            const owner = store.users.read(session.sub);
            const ok = await verifyTotpForApproval(request, reply, owner, session);
            if (!ok) return;
        }

        const agent = store.agents.read(agentEntry.agent_principal_id);
        agent.status = body.status;
        if (body.status === "REVOKED") {
            agent.revoked_at = new Date().toISOString();
        }
        store.agents.write(agent);

        return {
            agent_principal_id: agentEntry.agent_principal_id,
            agent_id: agent.agent_id,
            status: agent.status,
        };
    });

    // POST /v1/owner/agent-invites
    app.post("/v1/owner/agent-invites", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;

        const inviteToken = crypto.randomBytes(32).toString("base64url");
        const inviteId = crypto.randomUUID();
        const { hash, salt } = hashPassphrase(inviteToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        store.agentInvites.write({
            invite_id: inviteId,
            owner_type: "user",
            owner_id: session.sub,
            token_hash: hash,
            token_salt: salt,
            expires_at: expiresAt,
            used: false,
            used_at: null,
            created_at: new Date().toISOString(),
        });

        store.audit.append("AGENT_INVITE_CREATED", {
            user_principal_id: session.sub,
            invite_id: inviteId,
        });

        return {
            invite_id: inviteId,
            invite_token: inviteToken,
            expires_at: expiresAt,
        };
    });

    // ─── Organizations ─────────────────────────────────────────────────

    const ORG_ROLE_LEVEL: Record<OrgRole, number> = { org_admin: 3, org_member: 2, org_viewer: 1 };

    /**
     * Verify the session user has at least `minRole` in the given org.
     * Reads memberships from the store (not the token) for up-to-date data.
     * Returns the membership on success, or sends 403 and returns null.
     */
    function requireOrgRole(
        session: SessionClaims,
        orgId: string,
        minRole: OrgRole,
        reply: FastifyReply,
    ): OrgMembership | null {
        const memberships = store.memberships.listByUser(session.sub);
        const membership = memberships.find(
            (m) => m.org_id === orgId && m.status === "active",
        );
        if (!membership || ORG_ROLE_LEVEL[membership.role] < ORG_ROLE_LEVEL[minRole]) {
            reply.code(403).send({
                error: { code: "FORBIDDEN", message: "Insufficient organization permissions" },
            });
            return null;
        }
        return membership;
    }

    // POST /v1/owner/organizations — create a new organization (self-service)
    app.post("/v1/owner/organizations", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const body = request.body as {
            display_name: string;
            contact_identities?: ContactIdentity[];
        };

        if (!body.display_name?.trim()) {
            reply.code(400).send({
                error: { code: "INVALID_BODY", message: "display_name is required" },
            });
            return;
        }

        const orgId = crypto.randomUUID();
        const now = new Date().toISOString();
        const contacts = (body.contact_identities ?? []).map((c) => ({
            ...c,
            contact_id: c.contact_id || crypto.randomUUID(),
            verified: c.verified ?? false,
            verified_at: c.verified_at ?? null,
            added_at: c.added_at || now,
        }));

        store.organizations.write({
            org_id: orgId,
            display_name: body.display_name.trim(),
            status: "ACTIVE",
            attributes: {},
            created_at: now,
            created_by_user_id: session.sub,
            verification_status: "unverified",
            ...(contacts.length > 0 && { contact_identities: contacts }),
        });

        // Creator becomes org_admin
        const membershipId = crypto.randomUUID();
        store.memberships.write({
            membership_id: membershipId,
            org_id: orgId,
            user_principal_id: session.sub,
            role: "org_admin",
            status: "active",
            invited_by_user_id: null,
            created_at: now,
        });

        store.state.updateState((s) => {
            s.organizations.push({ org_id: orgId, path: `./organizations/${orgId}.md` });
            s.memberships.push({
                membership_id: membershipId,
                org_id: orgId,
                user_principal_id: session.sub,
                role: "org_admin",
                path: `./memberships/${membershipId}.json`,
            });
        });

        store.audit.append("ORG_CREATED", {
            org_id: orgId,
            display_name: body.display_name.trim(),
            created_by_user_id: session.sub,
        }, { principal_id: session.sub });

        return {
            org_id: orgId,
            display_name: body.display_name.trim(),
            status: "ACTIVE",
            created_at: now,
            your_role: "org_admin",
        };
    });

    // GET /v1/owner/organizations
    app.get("/v1/owner/organizations", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const memberships = store.memberships.listByUser(session.sub);
        const organizations = memberships
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
        return { organizations };
    });

    // GET /v1/owner/organizations/:orgId
    app.get("/v1/owner/organizations/:orgId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        const membership = requireOrgRole(session, orgId, "org_viewer", reply);
        if (!membership) return;

        try {
            const org = store.organizations.read(orgId);
            const members = store.memberships.listByOrg(orgId);
            return {
                ...org,
                member_count: members.length,
                your_role: membership.role,
            };
        } catch {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Organization not found" },
            });
        }
    });

    // PUT /v1/owner/organizations/:orgId
    app.put("/v1/owner/organizations/:orgId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const body = request.body as {
            display_name?: string;
            contact_identities?: ContactIdentity[];
            company_ids?: CompanyId[];
            domains?: OrgDomain[];
        };

        const org = store.organizations.read(orgId);
        if (body.display_name !== undefined) org.display_name = body.display_name.trim();
        if (body.contact_identities !== undefined) org.contact_identities = body.contact_identities;
        if (body.company_ids !== undefined) {
            org.company_ids = body.company_ids.map((cid) => {
                const result = validateCompanyIdValue(cid.id_type, cid.id_value, cid.country);
                return { ...cid, verification_level: result.valid ? "FORMAT_VALID" as const : "UNVERIFIED" as const };
            });
        }
        if (body.domains !== undefined) {
            org.domains = body.domains.map((d) => {
                const result = validateDomainName(d.domain);
                return {
                    ...d,
                    domain: d.domain.trim().toLowerCase(),
                    verification_level: result.valid ? "FORMAT_VALID" as const : "UNVERIFIED" as const,
                };
            });
        }
        org.identity_assurance_level = computeOrgAssuranceLevel(org);
        store.organizations.write(org);

        store.audit.append("ORG_UPDATED", {
            org_id: orgId,
            updated_by: session.sub,
        }, { principal_id: session.sub });

        return { org_id: orgId, status: "updated" };
    });

    // GET /v1/owner/organizations/:orgId/members
    app.get("/v1/owner/organizations/:orgId/members", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_viewer", reply)) return;

        const memberships = store.memberships.listByOrg(orgId);
        const members = memberships.map((m) => {
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
                    display_name: null,
                    role: m.role,
                    status: m.status,
                    created_at: m.created_at,
                };
            }
        });
        return { members };
    });

    // POST /v1/owner/organizations/:orgId/members — invite a user to the org
    app.post("/v1/owner/organizations/:orgId/members", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const body = request.body as { user_principal_id?: string; email?: string; role: string };

        if (!body.role) {
            reply.code(400).send({
                error: { code: "INVALID_BODY", message: "role is required" },
            });
            return;
        }

        if (!body.user_principal_id && !body.email) {
            reply.code(400).send({
                error: { code: "INVALID_BODY", message: "user_principal_id or email is required" },
            });
            return;
        }

        const parsed = OrgRole.safeParse(body.role);
        if (!parsed.success) {
            reply.code(400).send({
                error: { code: "INVALID_ROLE", message: `Invalid role. Valid: org_admin, org_member, org_viewer` },
            });
            return;
        }

        // Resolve user — by ID or by email lookup
        const state = store.state.getState();
        let targetUserId = body.user_principal_id;

        if (!targetUserId && body.email) {
            const emailLower = body.email.toLowerCase();
            for (const entry of state.users) {
                try {
                    const user = store.users.read(entry.user_principal_id);
                    const match = (user.contact_identities ?? []).find(
                        (c) => c.type === "EMAIL" && c.value.toLowerCase() === emailLower,
                    );
                    if (match) {
                        targetUserId = entry.user_principal_id;
                        break;
                    }
                } catch {
                    // skip unreadable users
                }
            }
            if (!targetUserId) {
                reply.code(404).send({
                    error: { code: "USER_NOT_FOUND", message: "No user found with that email address" },
                });
                return;
            }
        }

        if (!state.users.find((u) => u.user_principal_id === targetUserId)) {
            reply.code(404).send({
                error: { code: "USER_NOT_FOUND", message: "Target user not found" },
            });
            return;
        }

        // Check for existing membership
        const existing = store.memberships.listByOrg(orgId);
        if (existing.find((m) => m.user_principal_id === targetUserId)) {
            reply.code(409).send({
                error: { code: "ALREADY_MEMBER", message: "User is already a member of this organization" },
            });
            return;
        }

        // Check for existing pending invite
        const existingInvites = store.orgInvites.listByOrg(orgId);
        if (existingInvites.find((i) => i.user_principal_id === targetUserId && i.status === "pending")) {
            reply.code(409).send({
                error: { code: "ALREADY_INVITED", message: "User already has a pending invitation" },
            });
            return;
        }

        const inviteId = crypto.randomUUID();
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

        const invite: OrgInvite = {
            invite_id: inviteId,
            org_id: orgId,
            user_principal_id: targetUserId!,
            role: parsed.data,
            status: "pending",
            invited_by_user_id: session.sub,
            expires_at: expiresAt,
            responded_at: null,
            created_at: now,
        };

        store.orgInvites.write(invite);

        store.audit.append("ORG_INVITE_CREATED", {
            org_id: orgId,
            user_principal_id: targetUserId!,
            role: parsed.data,
            invited_by: session.sub,
            invite_id: inviteId,
        }, { principal_id: session.sub });

        const inviteOrg = store.organizations.read(orgId);
        events.emit("org_invite.created", {
            invite_id: inviteId,
            org_id: orgId,
            org_display_name: inviteOrg.display_name,
            user_principal_id: targetUserId!,
            role: parsed.data,
            invited_by_user_id: session.sub,
            expires_at: expiresAt,
        });

        return { invite_id: inviteId, org_id: orgId, user_principal_id: targetUserId!, role: parsed.data, status: "pending" };
    });

    // GET /v1/owner/organization-invites — list pending invites for current user
    app.get("/v1/owner/organization-invites", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const invites = store.orgInvites.listByUser(session.sub)
            .filter((i) => i.status === "pending" && new Date(i.expires_at) > new Date());
        const enriched = invites.map((i) => {
            try {
                const org = store.organizations.read(i.org_id);
                const inviter = store.users.read(i.invited_by_user_id);
                return { ...i, org_display_name: org.display_name, invited_by_name: inviter.display_name };
            } catch {
                return { ...i, org_display_name: null, invited_by_name: null };
            }
        });
        return { invites: enriched };
    });

    // POST /v1/owner/organization-invites/:inviteId/accept
    app.post("/v1/owner/organization-invites/:inviteId/accept", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { inviteId } = request.params as { inviteId: string };

        let invite: OrgInvite;
        try {
            invite = store.orgInvites.read(inviteId);
        } catch {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Invite not found" } });
            return;
        }

        if (invite.user_principal_id !== session.sub) {
            reply.code(403).send({ error: { code: "FORBIDDEN", message: "This invite is not for you" } });
            return;
        }
        if (invite.status !== "pending") {
            reply.code(400).send({ error: { code: "INVITE_NOT_PENDING", message: `Invite is already ${invite.status}` } });
            return;
        }
        if (new Date(invite.expires_at) < new Date()) {
            invite.status = "expired";
            store.orgInvites.write(invite);
            reply.code(400).send({ error: { code: "INVITE_EXPIRED", message: "Invite has expired" } });
            return;
        }

        // Accept: create membership
        invite.status = "accepted";
        invite.responded_at = new Date().toISOString();
        store.orgInvites.write(invite);

        const membershipId = crypto.randomUUID();
        const now = new Date().toISOString();
        const membership: OrgMembership = {
            membership_id: membershipId,
            org_id: invite.org_id,
            user_principal_id: session.sub,
            role: invite.role,
            status: "active",
            invited_by_user_id: invite.invited_by_user_id,
            created_at: now,
        };

        store.memberships.write(membership);
        store.state.updateState((s) => {
            s.memberships.push({
                membership_id: membershipId,
                org_id: invite.org_id,
                user_principal_id: session.sub,
                role: invite.role,
                path: `./memberships/${membershipId}.json`,
            });
        });

        store.audit.append("ORG_INVITE_ACCEPTED", {
            org_id: invite.org_id,
            invite_id: inviteId,
        }, { principal_id: session.sub });

        const acceptedOrg = store.organizations.read(invite.org_id);
        events.emit("org_member.added", {
            org_id: invite.org_id,
            org_display_name: acceptedOrg.display_name,
            user_principal_id: session.sub,
            role: invite.role,
            invited_by_user_id: invite.invited_by_user_id,
        });

        return { status: "accepted", membership_id: membershipId, org_id: invite.org_id };
    });

    // POST /v1/owner/organization-invites/:inviteId/decline
    app.post("/v1/owner/organization-invites/:inviteId/decline", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { inviteId } = request.params as { inviteId: string };

        let invite: OrgInvite;
        try {
            invite = store.orgInvites.read(inviteId);
        } catch {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Invite not found" } });
            return;
        }

        if (invite.user_principal_id !== session.sub) {
            reply.code(403).send({ error: { code: "FORBIDDEN", message: "This invite is not for you" } });
            return;
        }
        if (invite.status !== "pending") {
            reply.code(400).send({ error: { code: "INVITE_NOT_PENDING", message: `Invite is already ${invite.status}` } });
            return;
        }

        invite.status = "declined";
        invite.responded_at = new Date().toISOString();
        store.orgInvites.write(invite);

        store.audit.append("ORG_INVITE_DECLINED", {
            org_id: invite.org_id,
            invite_id: inviteId,
        }, { principal_id: session.sub });

        return { status: "declined", org_id: invite.org_id };
    });

    // DELETE /v1/owner/organizations/:orgId/invites/:inviteId — org admin cancels a pending invite
    app.delete("/v1/owner/organizations/:orgId/invites/:inviteId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, inviteId } = request.params as { orgId: string; inviteId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        let invite: OrgInvite;
        try {
            invite = store.orgInvites.read(inviteId);
        } catch {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Invite not found" } });
            return;
        }

        if (invite.org_id !== orgId) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Invite not found" } });
            return;
        }

        if (invite.status !== "pending") {
            reply.code(400).send({ error: { code: "INVITE_NOT_PENDING", message: `Invite is already ${invite.status}` } });
            return;
        }

        store.orgInvites.delete(inviteId);

        store.audit.append("ORG_INVITE_CANCELLED", {
            org_id: orgId,
            invite_id: inviteId,
            user_principal_id: invite.user_principal_id,
        }, { principal_id: session.sub });

        return { status: "cancelled", invite_id: inviteId };
    });

    // PUT /v1/owner/organizations/:orgId/members/:userId
    app.put("/v1/owner/organizations/:orgId/members/:userId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, userId } = request.params as { orgId: string; userId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const body = request.body as { role: string };
        const parsed = OrgRole.safeParse(body.role);
        if (!parsed.success) {
            reply.code(400).send({
                error: { code: "INVALID_ROLE", message: `Invalid role. Valid: org_admin, org_member, org_viewer` },
            });
            return;
        }

        const members = store.memberships.listByOrg(orgId);
        const target = members.find((m) => m.user_principal_id === userId);
        if (!target) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Membership not found" },
            });
            return;
        }

        // Last-admin protection
        if (target.role === "org_admin" && parsed.data !== "org_admin") {
            const adminCount = members.filter((m) => m.role === "org_admin" && m.status === "active").length;
            if (adminCount <= 1) {
                reply.code(400).send({
                    error: { code: "LAST_ADMIN", message: "Cannot demote the last organization admin" },
                });
                return;
            }
        }

        const previousRole = target.role;
        target.role = parsed.data;
        store.memberships.write(target);
        store.state.updateState((s) => {
            const entry = s.memberships.find((m) => m.membership_id === target.membership_id);
            if (entry) entry.role = parsed.data;
        });

        store.audit.append("ORG_MEMBER_UPDATED", {
            org_id: orgId,
            user_principal_id: userId,
            previous_role: previousRole,
            new_role: parsed.data,
        }, { principal_id: session.sub });

        return { membership_id: target.membership_id, role: parsed.data, status: "updated" };
    });

    // DELETE /v1/owner/organizations/:orgId/members/:userId
    app.delete("/v1/owner/organizations/:orgId/members/:userId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, userId } = request.params as { orgId: string; userId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const members = store.memberships.listByOrg(orgId);
        const target = members.find((m) => m.user_principal_id === userId);
        if (!target) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Membership not found" },
            });
            return;
        }

        // Last-admin protection
        if (target.role === "org_admin") {
            const adminCount = members.filter((m) => m.role === "org_admin" && m.status === "active").length;
            if (adminCount <= 1) {
                reply.code(400).send({
                    error: { code: "LAST_ADMIN", message: "Cannot remove the last organization admin" },
                });
                return;
            }
        }

        store.memberships.delete(target.membership_id);
        store.state.updateState((s) => {
            const idx = s.memberships.findIndex((m) => m.membership_id === target.membership_id);
            if (idx !== -1) s.memberships.splice(idx, 1);
        });

        store.audit.append("ORG_MEMBER_REMOVED", {
            org_id: orgId,
            user_principal_id: userId,
        }, { principal_id: session.sub });

        const removedOrg = store.organizations.read(orgId);
        events.emit("org_member.removed", {
            org_id: orgId,
            org_display_name: removedOrg.display_name,
            user_principal_id: userId,
            removed_by_user_id: session.sub,
        });

        return { membership_id: target.membership_id, status: "removed" };
    });

    // POST /v1/owner/organizations/:orgId/leave — any member can leave
    app.post("/v1/owner/organizations/:orgId/leave", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        const members = store.memberships.listByOrg(orgId);
        const target = members.find((m) => m.user_principal_id === session.sub && m.status === "active");
        if (!target) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "You are not a member of this organization" },
            });
            return;
        }

        // Last-admin protection
        if (target.role === "org_admin") {
            const adminCount = members.filter((m) => m.role === "org_admin" && m.status === "active").length;
            if (adminCount <= 1) {
                reply.code(400).send({
                    error: { code: "LAST_ADMIN", message: "Cannot leave — you are the last admin. Transfer admin role to another member first, or delete the organization." },
                });
                return;
            }
        }

        store.memberships.delete(target.membership_id);
        store.state.updateState((s) => {
            const idx = s.memberships.findIndex((m) => m.membership_id === target.membership_id);
            if (idx !== -1) s.memberships.splice(idx, 1);
        });

        store.audit.append("ORG_MEMBER_LEFT", {
            org_id: orgId,
            user_principal_id: session.sub,
        }, { principal_id: session.sub });

        const leftOrg = store.organizations.read(orgId);
        events.emit("org_member.removed", {
            org_id: orgId,
            org_display_name: leftOrg.display_name,
            user_principal_id: session.sub,
            removed_by_user_id: null,
        });

        return { status: "left", org_id: orgId };
    });

    // DELETE /v1/owner/organizations/:orgId — org_admin can delete the org
    app.delete("/v1/owner/organizations/:orgId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const summary = cascadeDeleteOrg(store, orgId);

        store.audit.append("ORG_DELETED", {
            org_id: orgId,
            deleted_by: session.sub,
            ...summary,
        }, { principal_id: session.sub });

        return { org_id: orgId, status: "deleted", ...summary };
    });

    // GET /v1/owner/organizations/:orgId/agents
    app.get("/v1/owner/organizations/:orgId/agents", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_viewer", reply)) return;

        const state = store.state.getState();
        const agents = state.agents
            .filter((a) => a.owner_type === "org" && a.owner_id === orgId)
            .map((entry) => {
                try {
                    return store.agents.read(entry.agent_principal_id);
                } catch {
                    return { agent_principal_id: entry.agent_principal_id, agent_id: entry.agent_id, error: "file_not_found" };
                }
            });
        return { agents };
    });

    // POST /v1/owner/organizations/:orgId/agent-invites
    app.post("/v1/owner/organizations/:orgId/agent-invites", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const inviteToken = crypto.randomBytes(32).toString("base64url");
        const inviteId = crypto.randomUUID();
        const { hash, salt } = hashPassphrase(inviteToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        store.agentInvites.write({
            invite_id: inviteId,
            owner_type: "org",
            owner_id: orgId,
            token_hash: hash,
            token_salt: salt,
            expires_at: expiresAt,
            used: false,
            used_at: null,
            created_at: new Date().toISOString(),
        });

        store.audit.append("AGENT_INVITE_CREATED", {
            org_id: orgId,
            invite_id: inviteId,
            created_by: session.sub,
        }, { principal_id: session.sub });

        return { invite_id: inviteId, invite_token: inviteToken, expires_at: expiresAt };
    });

    // GET /v1/owner/organizations/:orgId/policies
    app.get("/v1/owner/organizations/:orgId/policies", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_viewer", reply)) return;

        const state = store.state.getState();
        const policies = state.policies
            .filter((p) => p.owner_type === "org" && p.owner_id === orgId)
            .map((entry) => {
                try {
                    const yaml = store.policies.read(entry.policy_id);
                    return { ...entry, policy_yaml: yaml };
                } catch {
                    return { ...entry, error: "file_not_found" };
                }
            });
        return { policies };
    });

    // POST /v1/owner/organizations/:orgId/policies
    app.post("/v1/owner/organizations/:orgId/policies", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const body = request.body as {
            applies_to_agent_principal_id?: string | null;
            policy_yaml: string;
            name?: string;
            description?: string;
        };

        try {
            parsePolicyYaml(body.policy_yaml);
        } catch (e: unknown) {
            reply.code(400).send({
                error: { code: "INVALID_POLICY", message: (e as Error).message },
            });
            return;
        }

        const appliesToAgent = body.applies_to_agent_principal_id ?? null;

        // Validate that the target agent belongs to this org
        if (appliesToAgent) {
            const state = store.state.getState();
            const targetAgent = state.agents.find((a) => a.agent_principal_id === appliesToAgent);
            if (!targetAgent || targetAgent.owner_type !== "org" || targetAgent.owner_id !== orgId) {
                reply.code(400).send({
                    error: { code: "INVALID_AGENT", message: "Target agent does not belong to this organization" },
                });
                return;
            }
        }

        const policyId = crypto.randomUUID();
        store.policies.write(policyId, body.policy_yaml);

        const policyName = body.name?.trim() || null;
        const policyDescription = body.description?.trim() || null;

        store.state.updateState(s => {
            s.policies.push({
                policy_id: policyId,
                owner_type: "org",
                owner_id: orgId,
                applies_to_agent_principal_id: appliesToAgent,
                name: policyName,
                description: policyDescription,
                path: `./policies/${policyId}.yaml`,
            });
            s.bindings.push({
                owner_type: "org",
                owner_id: orgId,
                policy_id: policyId,
                applies_to_agent_principal_id: appliesToAgent,
            });
        });

        store.audit.append("POLICY_UPSERTED", {
            policy_id: policyId,
            org_id: orgId,
            created_by: session.sub,
            applies_to_agent_principal_id: appliesToAgent,
        }, { principal_id: session.sub });

        return { policy_id: policyId, org_id: orgId, applies_to_agent_principal_id: appliesToAgent };
    });

    // PUT /v1/owner/organizations/:orgId/policies/:policyId
    app.put("/v1/owner/organizations/:orgId/policies/:policyId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, policyId } = request.params as { orgId: string; policyId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const body = validateBody(request.body, SavePolicySchema, reply);
        if (!body) return;

        const state = store.state.getState();
        const entry = state.policies.find(
            (p) => p.policy_id === policyId && p.owner_type === "org" && p.owner_id === orgId,
        );
        if (!entry) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
            return;
        }

        if (body.policy_yaml !== undefined) {
            try {
                parsePolicyYaml(body.policy_yaml);
            } catch (e: unknown) {
                reply.code(400).send({ error: { code: "INVALID_POLICY", message: (e as Error).message } });
                return;
            }
            store.policies.write(policyId, body.policy_yaml);
        }

        let stateChanged = false;
        if (body.name !== undefined) { entry.name = body.name?.trim() || null; stateChanged = true; }
        if (body.description !== undefined) { entry.description = body.description?.trim() || null; stateChanged = true; }
        if (stateChanged) {
            store.state.updateState(s => {
                const idx = s.policies.findIndex(p => p.policy_id === policyId);
                if (idx !== -1) {
                    if (body.name !== undefined) s.policies[idx].name = entry.name;
                    if (body.description !== undefined) s.policies[idx].description = entry.description;
                }
            });
        }

        store.audit.append("POLICY_UPDATED", {
            policy_id: policyId,
            org_id: orgId,
            updated_by: session.sub,
        }, { principal_id: session.sub });

        return { policy_id: policyId, status: "updated" };
    });

    // DELETE /v1/owner/organizations/:orgId/policies/:policyId
    app.delete("/v1/owner/organizations/:orgId/policies/:policyId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, policyId } = request.params as { orgId: string; policyId: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const state = store.state.getState();
        const policyIndex = state.policies.findIndex(
            (p) => p.policy_id === policyId && p.owner_type === "org" && p.owner_id === orgId,
        );
        if (policyIndex === -1) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Policy not found" } });
            return;
        }

        store.policies.delete(policyId);
        store.state.updateState(s => {
            const idx = s.policies.findIndex(p => p.policy_id === policyId);
            if (idx !== -1) s.policies.splice(idx, 1);
            s.bindings = s.bindings.filter((b) => b.policy_id !== policyId);
        });

        store.audit.append("POLICY_DELETED", {
            policy_id: policyId,
            org_id: orgId,
            deleted_by: session.sub,
        }, { principal_id: session.sub });

        return { policy_id: policyId, status: "deleted" };
    });

    // GET /v1/owner/organizations/:orgId/approval-requests
    app.get("/v1/owner/organizations/:orgId/approval-requests", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };
        const query = request.query as { status?: string };

        if (!requireOrgRole(session, orgId, "org_member", reply)) return;

        const state = store.state.getState();
        let requests = (state.approval_requests ?? []).filter(
            (r) => r.owner_type === "org" && r.owner_id === orgId,
        );
        if (query.status) {
            requests = requests.filter((r) => r.status === query.status);
        }

        const details = requests.map((entry) => {
            try {
                return store.approvalRequests.read(entry.approval_request_id);
            } catch {
                return { approval_request_id: entry.approval_request_id, error: "file_not_found" };
            }
        });
        return { approval_requests: details };
    });

    // POST /v1/owner/organizations/:orgId/approval-requests/:id/approve
    app.post("/v1/owner/organizations/:orgId/approval-requests/:id/approve", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, id } = request.params as { orgId: string; id: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const approveOwner = store.users.read(session.sub);
        if (!(await verifyTotpForApproval(request, reply, approveOwner, session))) return;

        const state = store.state.getState();
        const entry = (state.approval_requests ?? []).find(
            (r) => r.approval_request_id === id && r.owner_type === "org" && r.owner_id === orgId,
        );
        if (!entry) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Approval request not found" } });
            return;
        }

        const req = store.approvalRequests.read(id);
        if (req.status !== "PENDING") {
            reply.code(400).send({
                error: { code: "INVALID_STATUS", message: `Cannot approve request with status ${req.status}` },
            });
            return;
        }

        if (new Date(req.expires_at).getTime() < Date.now()) {
            req.status = "EXPIRED";
            store.approvalRequests.write(req);
            store.state.updateState(s => {
                const e = (s.approval_requests ?? []).find(r => r.approval_request_id === id);
                if (e) e.status = "EXPIRED";
            });
            reply.code(400).send({ error: { code: "REQUEST_EXPIRED", message: "Approval request has expired" } });
            return;
        }

        const activeKey = store.keys.read(state.server_keys.active_kid);
        const ttl = config.approval?.token_ttl_seconds ?? 3600;
        const approvalToken = await issueApprovalToken({
            key: activeKey,
            approvalRequestId: id,
            ownerType: "org",
            ownerId: orgId,
            agentId: req.agent_id,
            actionType: req.action_type,
            actionHash: req.action_hash,
            ttlSeconds: ttl,
        });

        req.status = "APPROVED";
        req.approval_token = approvalToken.token;
        req.approval_token_expires_at = approvalToken.expiresAt;
        req.resolved_at = new Date().toISOString();
        req.resolved_by = session.sub;
        store.approvalRequests.write(req);

        store.state.updateState(s => {
            const e = (s.approval_requests ?? []).find(r => r.approval_request_id === id);
            if (e) e.status = "APPROVED";
        });

        store.audit.append("APPROVAL_REQUEST_APPROVED", {
            approval_request_id: id,
            org_id: orgId,
            approved_by: session.sub,
            agent_id: req.agent_id,
            action_type: req.action_type,
            agent_principal_id: req.agent_principal_id,
        }, { principal_id: session.sub });

        const approveAgent = store.agents.read(req.agent_principal_id);
        deliverWebhook({
            webhookUrl: approveAgent.webhook_url,
            webhookSecret: approveAgent.webhook_secret,
            webhookAuthToken: approveAgent.webhook_auth_token,
            payload: {
                event_type: 'approval_request.approved',
                timestamp: new Date().toISOString(),
                agent_principal_id: req.agent_principal_id,
                data: {
                    approval_request_id: id,
                    status: 'APPROVED',
                    approval_token: approvalToken.token,
                    approval_token_expires_at: approvalToken.expiresAt,
                    action_type: req.action_type,
                },
            },
            auditStore: store.audit,
        });

        return {
            approval_request_id: id,
            status: "APPROVED",
            approval_token: approvalToken.token,
            approval_token_expires_at: approvalToken.expiresAt,
        };
    });

    // POST /v1/owner/organizations/:orgId/approval-requests/:id/deny
    app.post("/v1/owner/organizations/:orgId/approval-requests/:id/deny", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, id } = request.params as { orgId: string; id: string };
        const body = request.body as { reason?: string; totp_code?: string } | null;

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const denyOwner = store.users.read(session.sub);
        if (!(await verifyTotpForApproval(request, reply, denyOwner, session))) return;

        const state = store.state.getState();
        const entry = (state.approval_requests ?? []).find(
            (r) => r.approval_request_id === id && r.owner_type === "org" && r.owner_id === orgId,
        );
        if (!entry) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Approval request not found" } });
            return;
        }

        const req = store.approvalRequests.read(id);
        if (req.status !== "PENDING") {
            reply.code(400).send({
                error: { code: "INVALID_STATUS", message: `Cannot deny request with status ${req.status}` },
            });
            return;
        }

        req.status = "DENIED";
        req.denial_reason = body?.reason ?? null;
        req.resolved_at = new Date().toISOString();
        req.resolved_by = session.sub;
        store.approvalRequests.write(req);

        store.state.updateState(s => {
            const e = (s.approval_requests ?? []).find(r => r.approval_request_id === id);
            if (e) e.status = "DENIED";
        });

        store.audit.append("APPROVAL_REQUEST_DENIED", {
            approval_request_id: id,
            org_id: orgId,
            denied_by: session.sub,
            agent_id: req.agent_id,
            action_type: req.action_type,
            agent_principal_id: req.agent_principal_id,
            reason: body?.reason ?? null,
        }, { principal_id: session.sub });

        const denyAgent = store.agents.read(req.agent_principal_id);
        deliverWebhook({
            webhookUrl: denyAgent.webhook_url,
            webhookSecret: denyAgent.webhook_secret,
            webhookAuthToken: denyAgent.webhook_auth_token,
            payload: {
                event_type: 'approval_request.denied',
                timestamp: new Date().toISOString(),
                agent_principal_id: req.agent_principal_id,
                data: {
                    approval_request_id: id,
                    status: 'DENIED',
                    denial_reason: body?.reason ?? null,
                    action_type: req.action_type,
                },
            },
            auditStore: store.audit,
        });

        return { approval_request_id: id, status: "DENIED" };
    });

    // GET /v1/owner/organizations/:orgId/policy-drafts
    app.get("/v1/owner/organizations/:orgId/policy-drafts", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId } = request.params as { orgId: string };
        const query = request.query as { status?: string };

        if (!requireOrgRole(session, orgId, "org_member", reply)) return;

        const state = store.state.getState();
        let drafts = (state.policy_drafts ?? []).filter(
            (d) => d.owner_type === "org" && d.owner_id === orgId,
        );
        if (query.status) {
            drafts = drafts.filter((d) => d.status === query.status);
        }

        const details = drafts.map((entry) => {
            try {
                return store.policyDrafts.read(entry.policy_draft_id);
            } catch {
                return { policy_draft_id: entry.policy_draft_id, error: "file_not_found" };
            }
        });
        return { policy_drafts: details };
    });

    // GET /v1/owner/organizations/:orgId/policy-drafts/:id
    app.get("/v1/owner/organizations/:orgId/policy-drafts/:id", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, id } = request.params as { orgId: string; id: string };

        if (!requireOrgRole(session, orgId, "org_member", reply)) return;

        const state = store.state.getState();
        const entry = (state.policy_drafts ?? []).find(
            (d) => d.policy_draft_id === id && d.owner_type === "org" && d.owner_id === orgId,
        );
        if (!entry) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Policy draft not found" } });
            return;
        }

        try {
            return store.policyDrafts.read(id);
        } catch {
            reply.code(404).send({ error: { code: "FILE_NOT_FOUND", message: "Policy draft file not found" } });
        }
    });

    // POST /v1/owner/organizations/:orgId/policy-drafts/:id/approve
    app.post("/v1/owner/organizations/:orgId/policy-drafts/:id/approve", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, id } = request.params as { orgId: string; id: string };

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const approveOwner = store.users.read(session.sub);
        if (!(await verifyTotpForApproval(request, reply, approveOwner, session))) return;

        const state = store.state.getState();
        const entry = (state.policy_drafts ?? []).find(
            (d) => d.policy_draft_id === id && d.owner_type === "org" && d.owner_id === orgId,
        );
        if (!entry) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Policy draft not found" } });
            return;
        }

        const draft = store.policyDrafts.read(id);
        if (draft.status !== "PENDING") {
            reply.code(400).send({
                error: { code: "INVALID_STATUS", message: `Cannot approve draft with status ${draft.status}` },
            });
            return;
        }

        try {
            parsePolicyYaml(draft.policy_yaml);
        } catch (e: unknown) {
            reply.code(400).send({ error: { code: "INVALID_POLICY", message: (e as Error).message } });
            return;
        }

        // Re-validate target agent ownership before creating binding
        const appliesToAgent = draft.applies_to_agent_principal_id;
        if (appliesToAgent) {
            const freshState = store.state.getState();
            const targetAgent = freshState.agents.find((a) => a.agent_principal_id === appliesToAgent);
            if (!targetAgent || targetAgent.owner_type !== "org" || targetAgent.owner_id !== orgId) {
                reply.code(400).send({
                    error: { code: "INVALID_AGENT", message: "Target agent does not belong to this organization" },
                });
                return;
            }
        }

        const policyId = crypto.randomUUID();
        store.policies.write(policyId, draft.policy_yaml);

        draft.status = "APPROVED";
        draft.resulting_policy_id = policyId;
        draft.resolved_at = new Date().toISOString();
        draft.resolved_by = session.sub;
        store.policyDrafts.write(draft);

        store.state.updateState(s => {
            s.policies.push({
                policy_id: policyId,
                owner_type: "org",
                owner_id: orgId,
                applies_to_agent_principal_id: appliesToAgent,
                name: draft.name ?? null,
                description: draft.description ?? null,
                path: `./policies/${policyId}.yaml`,
            });
            s.bindings.push({
                owner_type: "org",
                owner_id: orgId,
                policy_id: policyId,
                applies_to_agent_principal_id: appliesToAgent,
            });
            const draftEntry = (s.policy_drafts ?? []).find(d => d.policy_draft_id === id);
            if (draftEntry) draftEntry.status = "APPROVED";
        });

        store.audit.append("POLICY_DRAFT_APPROVED", {
            policy_draft_id: id,
            policy_id: policyId,
            org_id: orgId,
            approved_by: session.sub,
            agent_id: draft.agent_id,
            agent_principal_id: draft.agent_principal_id,
        }, { principal_id: session.sub });

        const policyApproveAgent = store.agents.read(draft.agent_principal_id);
        deliverWebhook({
            webhookUrl: policyApproveAgent.webhook_url,
            webhookSecret: policyApproveAgent.webhook_secret,
            webhookAuthToken: policyApproveAgent.webhook_auth_token,
            payload: {
                event_type: 'policy_draft.approved',
                timestamp: new Date().toISOString(),
                agent_principal_id: draft.agent_principal_id,
                data: { policy_draft_id: id, status: 'APPROVED', policy_id: policyId, applies_to_agent_principal_id: appliesToAgent },
            },
            auditStore: store.audit,
        });

        return { policy_draft_id: id, status: "APPROVED", policy_id: policyId, applies_to_agent_principal_id: appliesToAgent };
    });

    // POST /v1/owner/organizations/:orgId/policy-drafts/:id/deny
    app.post("/v1/owner/organizations/:orgId/policy-drafts/:id/deny", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { orgId, id } = request.params as { orgId: string; id: string };
        const body = request.body as { reason?: string; totp_code?: string } | null;

        if (!requireOrgRole(session, orgId, "org_admin", reply)) return;

        const denyOwner = store.users.read(session.sub);
        if (!(await verifyTotpForApproval(request, reply, denyOwner, session))) return;

        const state = store.state.getState();
        const entry = (state.policy_drafts ?? []).find(
            (d) => d.policy_draft_id === id && d.owner_type === "org" && d.owner_id === orgId,
        );
        if (!entry) {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: "Policy draft not found" } });
            return;
        }

        const draft = store.policyDrafts.read(id);
        if (draft.status !== "PENDING") {
            reply.code(400).send({
                error: { code: "INVALID_STATUS", message: `Cannot deny draft with status ${draft.status}` },
            });
            return;
        }

        draft.status = "DENIED";
        draft.denial_reason = body?.reason ?? null;
        draft.resolved_at = new Date().toISOString();
        draft.resolved_by = session.sub;
        store.policyDrafts.write(draft);

        store.state.updateState(s => {
            const draftEntry = (s.policy_drafts ?? []).find(d => d.policy_draft_id === id);
            if (draftEntry) draftEntry.status = "DENIED";
        });

        store.audit.append("POLICY_DRAFT_DENIED", {
            policy_draft_id: id,
            org_id: orgId,
            denied_by: session.sub,
            agent_id: draft.agent_id,
            agent_principal_id: draft.agent_principal_id,
            reason: body?.reason ?? null,
        }, { principal_id: session.sub });

        const policyDenyAgent = store.agents.read(draft.agent_principal_id);
        deliverWebhook({
            webhookUrl: policyDenyAgent.webhook_url,
            webhookSecret: policyDenyAgent.webhook_secret,
            webhookAuthToken: policyDenyAgent.webhook_auth_token,
            payload: {
                event_type: 'policy_draft.denied',
                timestamp: new Date().toISOString(),
                agent_principal_id: draft.agent_principal_id,
                data: { policy_draft_id: id, status: 'DENIED', denial_reason: body?.reason ?? null },
            },
            auditStore: store.audit,
        });

        return { policy_draft_id: id, status: "DENIED" };
    });

    // ─── Policies (scoped to owner) ──────────────────────────────────

    // GET /v1/owner/policies
    app.get("/v1/owner/policies", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const state = store.state.getState();
        const policies = state.policies
            .filter((p) => p.owner_type === "user" && p.owner_id === session.sub)
            .map((entry) => {
                try {
                    const yaml = store.policies.read(entry.policy_id);
                    return { ...entry, policy_yaml: yaml };
                } catch {
                    return { ...entry, error: "file_not_found" };
                }
            });
        return { policies };
    });

    // POST /v1/owner/policies
    app.post("/v1/owner/policies", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const body = request.body as {
            applies_to_agent_principal_id?: string | null;
            policy_yaml: string;
            name?: string;
            description?: string;
        };

        try {
            parsePolicyYaml(body.policy_yaml);
        } catch (e: unknown) {
            reply.code(400).send({
                error: { code: "INVALID_POLICY", message: (e as Error).message },
            });
            return;
        }

        const appliesToAgent = body.applies_to_agent_principal_id ?? null;

        // Validate that the target agent belongs to this user
        if (appliesToAgent) {
            const state = store.state.getState();
            const targetAgent = state.agents.find((a) => a.agent_principal_id === appliesToAgent);
            if (!targetAgent || targetAgent.owner_type !== "user" || targetAgent.owner_id !== session.sub) {
                reply.code(400).send({
                    error: { code: "INVALID_AGENT", message: "Target agent does not belong to you" },
                });
                return;
            }
        }

        const policyId = crypto.randomUUID();
        store.policies.write(policyId, body.policy_yaml);

        const policyName = body.name?.trim() || null;
        const policyDescription = body.description?.trim() || null;

        store.state.updateState(s => {
            s.policies.push({
                policy_id: policyId,
                owner_type: "user",
                owner_id: session.sub,
                applies_to_agent_principal_id: appliesToAgent,
                name: policyName,
                description: policyDescription,
                path: `./policies/${policyId}.yaml`,
            });

            s.bindings.push({
                owner_type: "user",
                owner_id: session.sub,
                policy_id: policyId,
                applies_to_agent_principal_id: appliesToAgent,
            });
        });

        store.audit.append("POLICY_UPSERTED", {
            policy_id: policyId,
            user_principal_id: session.sub,
            applies_to_agent_principal_id: appliesToAgent,
        });

        return {
            policy_id: policyId,
            user_principal_id: session.sub,
            applies_to_agent_principal_id: appliesToAgent,
        };
    });

    // GET /v1/owner/policies/:policyId
    app.get("/v1/owner/policies/:policyId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { policyId } = request.params as { policyId: string };

        const state = store.state.getState();
        const entry = state.policies.find(
            (p) => p.policy_id === policyId && p.owner_type === "user" && p.owner_id === session.sub,
        );

        if (!entry) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Policy not found" },
            });
            return;
        }

        try {
            const yaml = store.policies.read(policyId);
            return { ...entry, policy_yaml: yaml };
        } catch {
            reply.code(404).send({
                error: { code: "FILE_NOT_FOUND", message: "Policy file not found" },
            });
        }
    });

    // PUT /v1/owner/policies/:policyId
    app.put("/v1/owner/policies/:policyId", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { policyId } = request.params as { policyId: string };
        const body = validateBody(request.body, SavePolicySchema, reply);
        if (!body) return;

        const state = store.state.getState();
        const entry = state.policies.find(
            (p) => p.policy_id === policyId && p.owner_type === "user" && p.owner_id === session.sub,
        );

        if (!entry) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Policy not found" },
            });
            return;
        }

        if (body.policy_yaml !== undefined) {
            try {
                parsePolicyYaml(body.policy_yaml);
            } catch (e: unknown) {
                reply.code(400).send({
                    error: { code: "INVALID_POLICY", message: (e as Error).message },
                });
                return;
            }
            store.policies.write(policyId, body.policy_yaml);
        }

        let stateChanged = false;
        if (body.name !== undefined) {
            entry.name = body.name?.trim() || null;
            stateChanged = true;
        }
        if (body.description !== undefined) {
            entry.description = body.description?.trim() || null;
            stateChanged = true;
        }
        if (stateChanged) {
            store.state.updateState(s => {
                const idx = s.policies.findIndex(p => p.policy_id === policyId);
                if (idx !== -1) {
                    if (body.name !== undefined) s.policies[idx].name = entry.name;
                    if (body.description !== undefined) s.policies[idx].description = entry.description;
                }
            });
        }

        store.audit.append("POLICY_UPDATED", {
            policy_id: policyId,
            user_principal_id: session.sub,
        });

        return { policy_id: policyId, status: "updated" };
    });

    // DELETE /v1/owner/policies/:policyId
    app.delete(
        "/v1/owner/policies/:policyId",
        { preHandler: ownerAuth },
        async (request, reply) => {
            const session = (request as unknown as Record<string, unknown>)
                .ownerSession as SessionClaims;
            const { policyId } = request.params as { policyId: string };

            const state = store.state.getState();
            const policyIndex = state.policies.findIndex(
                (p) => p.policy_id === policyId && p.owner_type === "user" && p.owner_id === session.sub,
            );

            if (policyIndex === -1) {
                reply.code(404).send({
                    error: { code: "NOT_FOUND", message: "Policy not found" },
                });
                return;
            }

            // Require 2FA when deleting a policy
            const owner = store.users.read(session.sub);
            const ok = await verifyTotpForApproval(request, reply, owner, session);
            if (!ok) return;

            store.policies.delete(policyId);
            store.state.updateState(s => {
                const idx = s.policies.findIndex(p => p.policy_id === policyId);
                if (idx !== -1) s.policies.splice(idx, 1);
                s.bindings = s.bindings.filter((b) => b.policy_id !== policyId);
            });

            store.audit.append("POLICY_DELETED", {
                policy_id: policyId,
                user_principal_id: session.sub,
            });

            return { policy_id: policyId, status: "deleted" };
        },
    );

    // ─── TOTP two-factor authentication ──────────────────────────────

    // POST /v1/owner/totp/setup
    app.post("/v1/owner/totp/setup", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const owner = store.users.read(session.sub);

        const secret = generateTotpSecret();
        const uri = generateTotpUri(secret, owner.display_name);
        const { codes, hashes } = generateBackupCodes();

        owner.totp_secret_b32 = secret;
        owner.totp_enabled = false;
        owner.totp_backup_codes_hash = hashes;
        store.users.write(owner);

        const qr_svg = generateTotpQrSvg(uri);

        return { secret, uri, qr_svg, backup_codes: codes };
    });

    // POST /v1/owner/totp/confirm
    app.post("/v1/owner/totp/confirm", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const body = validateBody(request.body, TotpVerifySchema, reply);
        if (!body) return;
        const owner = store.users.read(session.sub);

        if (!owner.totp_secret_b32) {
            reply.code(400).send({
                error: { code: "TOTP_NOT_SETUP", message: "TOTP setup has not been initiated" },
            });
            return;
        }

        if (!verifyTotp(owner.totp_secret_b32, body.code)) {
            reply.code(400).send({
                error: { code: "INVALID_TOTP_CODE", message: "Invalid TOTP code" },
            });
            return;
        }

        owner.totp_enabled = true;
        owner.totp_enabled_at = new Date().toISOString();
        store.users.write(owner);

        store.audit.append("USER_TOTP_ENABLED", {
            user_principal_id: session.sub,
        });

        return { status: "totp_enabled" };
    });

    // POST /v1/owner/totp/disable
    app.post("/v1/owner/totp/disable", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const body = request.body as { code: string };
        const owner = store.users.read(session.sub);

        if (!owner.totp_enabled || !owner.totp_secret_b32) {
            reply.code(400).send({
                error: { code: "TOTP_NOT_ENABLED", message: "TOTP is not enabled" },
            });
            return;
        }

        // Accept either a TOTP code or a backup code
        let valid = verifyTotp(owner.totp_secret_b32, body.code);
        if (!valid && owner.totp_backup_codes_hash) {
            const result = verifyBackupCode(body.code, owner.totp_backup_codes_hash);
            valid = result.valid;
        }

        if (!valid) {
            reply.code(400).send({
                error: { code: "INVALID_TOTP_CODE", message: "Invalid TOTP or backup code" },
            });
            return;
        }

        delete owner.totp_secret_b32;
        delete owner.totp_enabled;
        delete owner.totp_enabled_at;
        delete owner.totp_backup_codes_hash;
        store.users.write(owner);

        store.audit.append("USER_TOTP_DISABLED", {
            user_principal_id: session.sub,
        });

        return { status: "totp_disabled" };
    });

    // DELETE /v1/owner/account — self-delete (GDPR right to erasure)
    app.delete("/v1/owner/account", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;

        const owner = store.users.read(session.sub);

        // Require TOTP verification if enabled
        if (owner.totp_enabled) {
            const body = request.body as { totp_code?: string } | null;
            const code = body?.totp_code;
            if (!code) {
                reply.code(403).send({
                    error: { code: "TOTP_REQUIRED", message: "Two-factor authentication code is required" },
                });
                return;
            }
            const valid = verifyTotp(code, owner.totp_secret_b32!);
            const backupValid = !valid && owner.totp_backup_codes_hash
                ? verifyBackupCode(code, owner.totp_backup_codes_hash)
                : null;
            if (!valid && !backupValid) {
                reply.code(403).send({
                    error: { code: "INVALID_TOTP", message: "Invalid 2FA code" },
                });
                return;
            }
        }

        const summary = cascadeDeleteUser(store, session.sub);

        store.audit.append("USER_DELETED", {
            user_principal_id: session.sub,
            self_delete: true,
            ...summary,
        });

        return { status: "deleted", ...summary };
    });

    // ─── TOTP verification helper ──────────────────────────────────────

    async function verifyTotpForApproval(
        request: FastifyRequest,
        reply: FastifyReply,
        owner: {
            totp_enabled?: boolean;
            totp_secret_b32?: string;
            totp_backup_codes_hash?: string[];
        },
        session: SessionClaims,
    ): Promise<boolean> {
        // If require_totp is set but owner hasn't set up TOTP, block
        if (config.security.require_totp && !owner.totp_enabled) {
            reply.code(403).send({
                error: {
                    code: "TOTP_SETUP_REQUIRED",
                    message: "Two-factor authentication setup is required",
                },
            });
            return false;
        }

        if (!owner.totp_enabled) return true;

        const body = request.body as { totp_code?: string } | null;
        const code = body?.totp_code;

        if (!code) {
            reply.code(403).send({
                error: {
                    code: "TOTP_REQUIRED",
                    message: "Two-factor authentication code is required",
                },
            });
            return false;
        }

        // Try TOTP code first
        if (owner.totp_secret_b32 && verifyTotp(owner.totp_secret_b32, code)) {
            return true;
        }

        // Try backup code
        if (owner.totp_backup_codes_hash) {
            const result = verifyBackupCode(code, owner.totp_backup_codes_hash);
            if (result.valid) {
                owner.totp_backup_codes_hash = result.remainingHashes;
                store.users.write(owner as import("@openleash/core").UserFrontmatter);

                store.audit.append("USER_TOTP_BACKUP_USED", {
                    user_principal_id: session.sub,
                    remaining_codes: result.remainingHashes.length,
                });
                return true;
            }
        }

        reply.code(403).send({
            error: { code: "TOTP_REQUIRED", message: "Invalid two-factor authentication code" },
        });
        return false;
    }

    // ─── Approval requests (scoped to owner) ─────────────────────────

    // GET /v1/owner/approval-requests
    app.get("/v1/owner/approval-requests", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const query = request.query as { status?: string };

        const state = store.state.getState();
        let requests = (state.approval_requests ?? []).filter(
            (r) => r.owner_type === "user" && r.owner_id === session.sub,
        );

        if (query.status) {
            requests = requests.filter((r) => r.status === query.status);
        }

        const details = requests.map((entry) => {
            try {
                return store.approvalRequests.read(entry.approval_request_id);
            } catch {
                return { approval_request_id: entry.approval_request_id, error: "file_not_found" };
            }
        });

        return { approval_requests: details };
    });

    // GET /v1/owner/approval-requests/:id
    app.get(
        "/v1/owner/approval-requests/:id",
        { preHandler: ownerAuth },
        async (request, reply) => {
            const session = (request as unknown as Record<string, unknown>)
                .ownerSession as SessionClaims;
            const { id } = request.params as { id: string };

            const state = store.state.getState();
            const entry = (state.approval_requests ?? []).find(
                (r) => r.approval_request_id === id && r.owner_type === "user" && r.owner_id === session.sub,
            );

            if (!entry) {
                reply.code(404).send({
                    error: { code: "NOT_FOUND", message: "Approval request not found" },
                });
                return;
            }

            try {
                return store.approvalRequests.read(id);
            } catch {
                reply.code(404).send({
                    error: { code: "FILE_NOT_FOUND", message: "Approval request file not found" },
                });
            }
        },
    );

    // POST /v1/owner/approval-requests/:id/approve
    app.post(
        "/v1/owner/approval-requests/:id/approve",
        { preHandler: ownerAuth },
        async (request, reply) => {
            const session = (request as unknown as Record<string, unknown>)
                .ownerSession as SessionClaims;
            const { id } = request.params as { id: string };

            const state = store.state.getState();
            const entry = (state.approval_requests ?? []).find(
                (r) => r.approval_request_id === id && r.owner_type === "user" && r.owner_id === session.sub,
            );

            if (!entry) {
                reply.code(404).send({
                    error: { code: "NOT_FOUND", message: "Approval request not found" },
                });
                return;
            }

            // TOTP verification
            const approveOwner = store.users.read(session.sub);
            if (!(await verifyTotpForApproval(request, reply, approveOwner, session))) return;

            const req = store.approvalRequests.read(id);

            if (req.status !== "PENDING") {
                reply.code(400).send({
                    error: {
                        code: "INVALID_STATUS",
                        message: `Cannot approve request with status ${req.status}`,
                    },
                });
                return;
            }

            // Check expiry
            if (new Date(req.expires_at).getTime() < Date.now()) {
                req.status = "EXPIRED";
                store.approvalRequests.write(req);
                store.state.updateState(s => {
                    const e = (s.approval_requests ?? []).find(
                        r => r.approval_request_id === id,
                    );
                    if (e) e.status = "EXPIRED";
                });

                reply.code(400).send({
                    error: { code: "REQUEST_EXPIRED", message: "Approval request has expired" },
                });
                return;
            }

            // Issue approval token
            const activeKey = store.keys.read(state.server_keys.active_kid);
            const ttl = config.approval?.token_ttl_seconds ?? 3600;
            const approvalToken = await issueApprovalToken({
                key: activeKey,
                approvalRequestId: id,
                ownerType: "user",
                ownerId: session.sub,
                agentId: req.agent_id,
                actionType: req.action_type,
                actionHash: req.action_hash,
                ttlSeconds: ttl,
            });

            req.status = "APPROVED";
            req.approval_token = approvalToken.token;
            req.approval_token_expires_at = approvalToken.expiresAt;
            req.resolved_at = new Date().toISOString();
            req.resolved_by = session.sub;
            store.approvalRequests.write(req);

            store.state.updateState(s => {
                const e = (s.approval_requests ?? []).find(
                    r => r.approval_request_id === id,
                );
                if (e) e.status = "APPROVED";
            });

            store.audit.append("APPROVAL_REQUEST_APPROVED", {
                approval_request_id: id,
                user_principal_id: session.sub,
                agent_id: req.agent_id,
                action_type: req.action_type,
                agent_principal_id: req.agent_principal_id,
            });

            // Fire webhook
            const approveAgent = store.agents.read(req.agent_principal_id);
            deliverWebhook({
                webhookUrl: approveAgent.webhook_url,
                webhookSecret: approveAgent.webhook_secret,
                webhookAuthToken: approveAgent.webhook_auth_token,
                payload: {
                    event_type: 'approval_request.approved',
                    timestamp: new Date().toISOString(),
                    agent_principal_id: req.agent_principal_id,
                    data: {
                        approval_request_id: id,
                        status: 'APPROVED',
                        approval_token: approvalToken.token,
                        approval_token_expires_at: approvalToken.expiresAt,
                        action_type: req.action_type,
                    },
                },
                auditStore: store.audit,
            });

            return {
                approval_request_id: id,
                status: "APPROVED",
                approval_token: approvalToken.token,
                approval_token_expires_at: approvalToken.expiresAt,
            };
        },
    );

    // POST /v1/owner/approval-requests/:id/deny
    app.post(
        "/v1/owner/approval-requests/:id/deny",
        { preHandler: ownerAuth },
        async (request, reply) => {
            const session = (request as unknown as Record<string, unknown>)
                .ownerSession as SessionClaims;
            const { id } = request.params as { id: string };
            const body = request.body as { reason?: string; totp_code?: string } | null;

            // TOTP verification
            const denyOwner = store.users.read(session.sub);
            if (!(await verifyTotpForApproval(request, reply, denyOwner, session))) return;

            const state = store.state.getState();
            const entry = (state.approval_requests ?? []).find(
                (r) => r.approval_request_id === id && r.owner_type === "user" && r.owner_id === session.sub,
            );

            if (!entry) {
                reply.code(404).send({
                    error: { code: "NOT_FOUND", message: "Approval request not found" },
                });
                return;
            }

            const req = store.approvalRequests.read(id);

            if (req.status !== "PENDING") {
                reply.code(400).send({
                    error: {
                        code: "INVALID_STATUS",
                        message: `Cannot deny request with status ${req.status}`,
                    },
                });
                return;
            }

            req.status = "DENIED";
            req.denial_reason = body?.reason ?? null;
            req.resolved_at = new Date().toISOString();
            req.resolved_by = session.sub;
            store.approvalRequests.write(req);

            store.state.updateState(s => {
                const e = (s.approval_requests ?? []).find(
                    r => r.approval_request_id === id,
                );
                if (e) e.status = "DENIED";
            });

            store.audit.append("APPROVAL_REQUEST_DENIED", {
                approval_request_id: id,
                user_principal_id: session.sub,
                agent_id: req.agent_id,
                action_type: req.action_type,
                agent_principal_id: req.agent_principal_id,
                reason: body?.reason ?? null,
            });

            // Fire webhook
            const denyAgent = store.agents.read(req.agent_principal_id);
            deliverWebhook({
                webhookUrl: denyAgent.webhook_url,
                webhookSecret: denyAgent.webhook_secret,
                webhookAuthToken: denyAgent.webhook_auth_token,
                payload: {
                    event_type: 'approval_request.denied',
                    timestamp: new Date().toISOString(),
                    agent_principal_id: req.agent_principal_id,
                    data: {
                        approval_request_id: id,
                        status: 'DENIED',
                        denial_reason: body?.reason ?? null,
                        action_type: req.action_type,
                    },
                },
                auditStore: store.audit,
            });

            return {
                approval_request_id: id,
                status: "DENIED",
            };
        },
    );

    // ─── Policy drafts (owner-facing) ──────────────────────────────────

    // GET /v1/owner/policy-drafts
    app.get("/v1/owner/policy-drafts", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const query = request.query as { status?: string };

        const state = store.state.getState();
        let drafts = (state.policy_drafts ?? []).filter(
            (d) => d.owner_type === "user" && d.owner_id === session.sub,
        );

        if (query.status) {
            drafts = drafts.filter((d) => d.status === query.status);
        }

        const details = drafts.map((entry) => {
            try {
                return store.policyDrafts.read(entry.policy_draft_id);
            } catch {
                return { policy_draft_id: entry.policy_draft_id, error: "file_not_found" };
            }
        });

        return { policy_drafts: details };
    });

    // GET /v1/owner/policy-drafts/:id
    app.get("/v1/owner/policy-drafts/:id", { preHandler: ownerAuth }, async (request, reply) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const { id } = request.params as { id: string };

        const state = store.state.getState();
        const entry = (state.policy_drafts ?? []).find(
            (d) => d.policy_draft_id === id && d.owner_type === "user" && d.owner_id === session.sub,
        );

        if (!entry) {
            reply.code(404).send({
                error: { code: "NOT_FOUND", message: "Policy draft not found" },
            });
            return;
        }

        try {
            return store.policyDrafts.read(id);
        } catch {
            reply.code(404).send({
                error: { code: "FILE_NOT_FOUND", message: "Policy draft file not found" },
            });
        }
    });

    // POST /v1/owner/policy-drafts/:id/approve
    app.post(
        "/v1/owner/policy-drafts/:id/approve",
        { preHandler: ownerAuth },
        async (request, reply) => {
            const session = (request as unknown as Record<string, unknown>)
                .ownerSession as SessionClaims;
            const { id } = request.params as { id: string };

            const state = store.state.getState();
            const entry = (state.policy_drafts ?? []).find(
                (d) => d.policy_draft_id === id && d.owner_type === "user" && d.owner_id === session.sub,
            );

            if (!entry) {
                reply.code(404).send({
                    error: { code: "NOT_FOUND", message: "Policy draft not found" },
                });
                return;
            }

            // TOTP verification
            const approveOwner = store.users.read(session.sub);
            if (!(await verifyTotpForApproval(request, reply, approveOwner, session))) return;

            const draft = store.policyDrafts.read(id);

            if (draft.status !== "PENDING") {
                reply.code(400).send({
                    error: {
                        code: "INVALID_STATUS",
                        message: `Cannot approve draft with status ${draft.status}`,
                    },
                });
                return;
            }

            // Re-validate the policy YAML (defensive)
            try {
                parsePolicyYaml(draft.policy_yaml);
            } catch (e: unknown) {
                reply.code(400).send({
                    error: { code: "INVALID_POLICY", message: (e as Error).message },
                });
                return;
            }

            // Re-validate target agent ownership before creating binding
            const appliesToAgent = draft.applies_to_agent_principal_id;
            if (appliesToAgent) {
                const freshState = store.state.getState();
                const targetAgent = freshState.agents.find((a) => a.agent_principal_id === appliesToAgent);
                if (!targetAgent || targetAgent.owner_type !== "user" || targetAgent.owner_id !== session.sub) {
                    reply.code(400).send({
                        error: { code: "INVALID_AGENT", message: "Target agent does not belong to you" },
                    });
                    return;
                }
            }

            // Create the real policy
            const policyId = crypto.randomUUID();
            store.policies.write(policyId, draft.policy_yaml);

            // Update the draft
            draft.status = "APPROVED";
            draft.resulting_policy_id = policyId;
            draft.resolved_at = new Date().toISOString();
            draft.resolved_by = session.sub;
            store.policyDrafts.write(draft);

            store.state.updateState(s => {
                s.policies.push({
                    policy_id: policyId,
                    owner_type: "user",
                    owner_id: session.sub,
                    applies_to_agent_principal_id: appliesToAgent,
                    name: draft.name ?? null,
                    description: draft.description ?? null,
                    path: `./policies/${policyId}.yaml`,
                });

                s.bindings.push({
                    owner_type: "user",
                    owner_id: session.sub,
                    policy_id: policyId,
                    applies_to_agent_principal_id: appliesToAgent,
                });

                const draftEntry = (s.policy_drafts ?? []).find(
                    d => d.policy_draft_id === id,
                );
                if (draftEntry) draftEntry.status = "APPROVED";
            });

            store.audit.append("POLICY_DRAFT_APPROVED", {
                policy_draft_id: id,
                policy_id: policyId,
                user_principal_id: session.sub,
                agent_id: draft.agent_id,
                agent_principal_id: draft.agent_principal_id,
                applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
            });

            // Fire webhook
            const policyApproveAgent = store.agents.read(draft.agent_principal_id);
            deliverWebhook({
                webhookUrl: policyApproveAgent.webhook_url,
                webhookSecret: policyApproveAgent.webhook_secret,
                webhookAuthToken: policyApproveAgent.webhook_auth_token,
                payload: {
                    event_type: 'policy_draft.approved',
                    timestamp: new Date().toISOString(),
                    agent_principal_id: draft.agent_principal_id,
                    data: {
                        policy_draft_id: id,
                        status: 'APPROVED',
                        policy_id: policyId,
                        applies_to_agent_principal_id: appliesToAgent,
                    },
                },
                auditStore: store.audit,
            });

            return {
                policy_draft_id: id,
                status: "APPROVED",
                policy_id: policyId,
                applies_to_agent_principal_id: appliesToAgent,
            };
        },
    );

    // POST /v1/owner/policy-drafts/:id/deny
    app.post(
        "/v1/owner/policy-drafts/:id/deny",
        { preHandler: ownerAuth },
        async (request, reply) => {
            const session = (request as unknown as Record<string, unknown>)
                .ownerSession as SessionClaims;
            const { id } = request.params as { id: string };
            const body = request.body as { reason?: string; totp_code?: string } | null;

            // TOTP verification
            const denyOwner = store.users.read(session.sub);
            if (!(await verifyTotpForApproval(request, reply, denyOwner, session))) return;

            const state = store.state.getState();
            const entry = (state.policy_drafts ?? []).find(
                (d) => d.policy_draft_id === id && d.owner_type === "user" && d.owner_id === session.sub,
            );

            if (!entry) {
                reply.code(404).send({
                    error: { code: "NOT_FOUND", message: "Policy draft not found" },
                });
                return;
            }

            const draft = store.policyDrafts.read(id);

            if (draft.status !== "PENDING") {
                reply.code(400).send({
                    error: {
                        code: "INVALID_STATUS",
                        message: `Cannot deny draft with status ${draft.status}`,
                    },
                });
                return;
            }

            draft.status = "DENIED";
            draft.denial_reason = body?.reason ?? null;
            draft.resolved_at = new Date().toISOString();
            draft.resolved_by = session.sub;
            store.policyDrafts.write(draft);

            store.state.updateState(s => {
                const draftEntry = (s.policy_drafts ?? []).find(
                    d => d.policy_draft_id === id,
                );
                if (draftEntry) draftEntry.status = "DENIED";
            });

            store.audit.append("POLICY_DRAFT_DENIED", {
                policy_draft_id: id,
                user_principal_id: session.sub,
                agent_id: draft.agent_id,
                agent_principal_id: draft.agent_principal_id,
                applies_to_agent_principal_id: draft.applies_to_agent_principal_id,
                reason: body?.reason ?? null,
            });

            // Fire webhook
            const policyDenyAgent = store.agents.read(draft.agent_principal_id);
            deliverWebhook({
                webhookUrl: policyDenyAgent.webhook_url,
                webhookSecret: policyDenyAgent.webhook_secret,
                webhookAuthToken: policyDenyAgent.webhook_auth_token,
                payload: {
                    event_type: 'policy_draft.denied',
                    timestamp: new Date().toISOString(),
                    agent_principal_id: draft.agent_principal_id,
                    data: {
                        policy_draft_id: id,
                        status: 'DENIED',
                        denial_reason: body?.reason ?? null,
                    },
                },
                auditStore: store.audit,
            });

            return {
                policy_draft_id: id,
                status: "DENIED",
            };
        },
    );

    // ─── Owner audit ──────────────────────────────────────────────────

    // GET /v1/owner/audit
    app.get("/v1/owner/audit", { preHandler: ownerAuth }, async (request) => {
        const session = (request as unknown as Record<string, unknown>)
            .ownerSession as SessionClaims;
        const query = request.query as { limit?: string; cursor?: string };
        const limit = query.limit
            ? Math.max(1, Math.min(parseInt(query.limit, 10) || 1, 1000))
            : 50;
        const cursor = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;

        // Find this owner's agents for filtering
        const state = store.state.getState();
        const ownerAgentIds = new Set(
            state.agents
                .filter((a) => a.owner_type === "user" && a.owner_id === session.sub)
                .map((a) => a.agent_principal_id),
        );

        const data = store.audit.readByPrincipal(session.sub, ownerAgentIds, limit, cursor);
        const nextCursor = cursor + limit < data.total ? String(cursor + limit) : null;

        return {
            items: data.items,
            next_cursor: nextCursor,
        };
    });
}
