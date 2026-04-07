export { renderPage, setVersion, escapeHtml, formatNameWithId, copyableId, authBrandHtml } from "./shared/layout.js";
export type { RenderPageOptions } from "./shared/layout.js";
export { renderDashboard } from "./pages/dashboard/render.js";
export type { DashboardData } from "./pages/dashboard/render.js";
export { renderOwners, renderOwnerDetail } from "./pages/owners/render.js";
export type { OwnerData, OwnerDetailData } from "./pages/owners/render.js";
export { renderAgents } from "./pages/agents/render.js";
export type { AgentData, OwnerOption as AgentOwnerOption } from "./pages/agents/render.js";
export { renderPolicies, renderPolicyViewer } from "./pages/policies/render.js";
export type { PolicyListEntry, PolicyDetail, BindingEntry } from "./pages/policies/render.js";
export { renderConfig } from "./pages/config/render.js";
export type { ConfigData } from "./pages/config/render.js";
export { renderMcpGlove } from "./pages/mcp-glove/render.js";
export type { McpGlovePageData } from "./pages/mcp-glove/render.js";
export { renderAudit } from "./pages/audit/render.js";
export type { AuditData, AuditEntry, AuditNameMap, AuditScopeOption } from "./pages/audit/render.js";
export { renderOwnerLogin } from "./pages/owner-login/render.js";
export { renderOwnerSetup } from "./pages/owner-setup/render.js";
export { renderOwnerDashboard } from "./pages/owner-dashboard/render.js";
export type { OwnerDashboardData } from "./pages/owner-dashboard/render.js";
export { renderOwnerApprovals } from "./pages/owner-approvals/render.js";
export type { OwnerApprovalEntry, OwnerApprovalsOptions } from "./pages/owner-approvals/render.js";
export { renderOwnerAgents } from "./pages/owner-agents/render.js";
export type { OwnerAgentEntry, OwnerAgentsOptions } from "./pages/owner-agents/render.js";
export { renderOwnerPolicies } from "./pages/owner-policies/render.js";
export type {
    OwnerPolicyEntry,
    OwnerPolicyDraftEntry,
    OwnerPoliciesOptions,
} from "./pages/owner-policies/render.js";
export { renderOwnerPolicyCreate } from "./pages/owner-policy-create/render.js";
export { renderOwnerProfile } from "./pages/owner-profile/render.js";
export type { OwnerProfileData } from "./pages/owner-profile/render.js";
export { renderInitialSetup } from "./pages/initial-setup/render.js";
export { renderAdminLogin } from "./pages/admin-login/render.js";
export { renderAbout } from "./pages/about/render.js";
export type { AboutData, PackageInfo } from "./pages/about/render.js";
export { renderApiReference, renderApiReferenceUnavailable } from "./pages/api-reference/render.js";
export { renderAdminOrganizations, renderAdminOrganizationDetail } from "./pages/admin-organizations/render.js";
export type { OrgListData, OrgDetailData } from "./pages/admin-organizations/render.js";
export { renderOwnerOrganizations, renderOwnerOrganizationDetail } from "./pages/owner-organizations/render.js";
export type { OwnerOrgEntry, OwnerOrgDetailData, PendingOrgInvite } from "./pages/owner-organizations/render.js";
export * from "./shared/validation.js";
export { initManifest, resolveAsset, resolveAssetCss, assetTags, getClientDir } from "./shared/manifest.js";
