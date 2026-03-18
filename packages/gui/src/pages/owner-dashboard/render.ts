import { renderPage, escapeHtml, infoIcon, INFO_DECISIONS, INFO_PROOF_TOKENS, type RenderPageOptions } from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";

export interface OwnerDashboardData {
    display_name: string;
    agent_count: number;
    policy_count: number;
    pending_approvals: number;
    pending_policy_drafts: number;
}

export function renderOwnerDashboard(data: OwnerDashboardData, renderPageOptions?: RenderPageOptions): string {
    const needsSetup = data.agent_count === 0 || data.policy_count === 0;

    const content = `
    <div class="page-header">
      <h2>Welcome, ${escapeHtml(data.display_name)}</h2>
      <p>Manage your agents, policies, and approval requests</p>
    </div>

    <div class="odash-stat-grid">
      <div class="card">
        <div class="odash-stat-value">${data.agent_count}</div>
        <div class="odash-stat-label">My Agents</div>
      </div>
      <div class="card">
        <div class="odash-stat-value">${data.policy_count}</div>
        <div class="odash-stat-label">My Policies</div>
      </div>
      <div class="card">
        <div class="odash-stat-value${data.pending_approvals > 0 ? " odash-stat-value-warn" : ""}">${data.pending_approvals}</div>
        <div class="odash-stat-label">Pending Approvals</div>
      </div>
      <div class="card">
        <div class="odash-stat-value${data.pending_policy_drafts > 0 ? " odash-stat-value-warn" : ""}">${data.pending_policy_drafts}</div>
        <div class="odash-stat-label">Policy Drafts</div>
      </div>
    </div>

    ${
        data.pending_approvals > 0
            ? `
    <div class="card odash-notice">
      <span class="odash-notice-text">You have ${data.pending_approvals} pending approval request${data.pending_approvals > 1 ? "s" : ""}.</span>
      <a href="/gui/owner/approvals" class="odash-notice-action">Review now</a>
    </div>`
            : ""
    }

    ${
        data.pending_policy_drafts > 0
            ? `
    <div class="card odash-notice">
      <span class="odash-notice-text">You have ${data.pending_policy_drafts} pending policy draft${data.pending_policy_drafts > 1 ? "s" : ""} from your agents.</span>
      <a href="/gui/owner/policy-drafts" class="odash-notice-action">Review now</a>
    </div>`
            : ""
    }

    ${
        needsSetup
            ? `
    <div class="card odash-setup-card">
      <div class="card-title">Getting Started</div>
      <p class="odash-setup-intro">
        Set up your agents and policies to start using OpenLeash authorization.
      </p>
      <div class="flex-col gap-12">
        <div class="odash-step">
          <span class="material-symbols-outlined odash-step-check">check</span>
          <div>
            <div class="odash-step-title">Account Created</div>
            <div class="odash-step-hint-done">You're logged in as ${escapeHtml(data.display_name)}.</div>
          </div>
        </div>
        <div class="odash-step">
          <span class="step-number ${data.agent_count > 0 ? "step-number-done" : "step-number-pending"}">1</span>
          <div>
            <div class="odash-step-title">Register Your Agents</div>
            <div class="detail-hint">
              ${
                  data.agent_count > 0
                      ? '<span class="text-success">Done</span>'
                      : 'Your administrator will register agents on your behalf. They will appear in <a href="/gui/owner/agents" class="link-green">My Agents</a>.'
              }
            </div>
          </div>
        </div>
        <div class="odash-step">
          <span class="step-number ${data.policy_count > 0 ? "step-number-done" : "step-number-pending"}">2</span>
          <div>
            <div class="odash-step-title">Create Policies</div>
            <div class="detail-hint">
              ${
                  data.policy_count > 0
                      ? '<span class="text-success">Done</span>'
                      : 'Go to <a href="/gui/owner/policies" class="link-green">My Policies</a> and write YAML rules that control what your agents can do.'
              }
            </div>
          </div>
        </div>
        <div class="odash-step">
          <span class="step-number step-number-pending">3</span>
          <div>
            <div class="odash-step-title">Review Approval Requests</div>
            <div class="detail-hint">
              When your policies use REQUIRE_APPROVAL, agents will ask for your permission in <a href="/gui/owner/approvals" class="link-green">Approvals</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
    `
            : ""
    }

    <div class="odash-info-grid">
      <div class="card">
        <div class="card-title">What You Can Do</div>
        <div class="odash-feature-list">
          <div>
            <a href="/gui/owner/agents" class="odash-feature-link">My Agents</a>
            <p class="odash-feature-desc">
              View all AI agents registered under your account. You can see their status and revoke access to any agent that should no longer act on your behalf.
            </p>
          </div>
          <div>
            <a href="/gui/owner/policies" class="odash-feature-link">My Policies</a>
            <p class="odash-feature-desc">
              Create and edit YAML-based authorization policies. Policies define which actions your agents are allowed or denied, and can require human approval for sensitive operations.
            </p>
          </div>
          <div>
            <a href="/gui/owner/approvals" class="odash-feature-link">Approvals</a>
            <p class="odash-feature-desc">
              Review and approve or deny requests from your agents. When a policy requires human approval, the agent's request appears here for you to review.
            </p>
          </div>
          <div>
            <a href="/gui/owner/policy-drafts" class="odash-feature-link">Policy Drafts</a>
            <p class="odash-feature-desc">
              Your agents can propose new policies when they need access to action types not yet covered. Review the proposed YAML and approve or deny each draft.
            </p>
          </div>
          <div>
            <a href="/gui/owner/profile" class="odash-feature-link">Profile</a>
            <p class="odash-feature-desc">
              Manage your identity information, including contact details, government IDs, and company identifiers. Higher identity assurance levels unlock more capabilities.
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Key Concepts</div>
        <div class="odash-feature-list">
          <div>
            <div class="odash-concept-title">Policy Decisions${infoIcon("owner-decisions", INFO_DECISIONS)}</div>
            <p class="odash-feature-desc">
              Policies evaluate to one of five decisions: <span class="badge badge-green">ALLOW</span> <span class="badge badge-red">DENY</span> <span class="badge badge-amber">REQUIRE_APPROVAL</span> <span class="badge badge-amber">REQUIRE_STEP_UP</span> <span class="badge badge-amber">REQUIRE_DEPOSIT</span>
            </p>
          </div>
          <div>
            <div class="odash-concept-title">Proof Tokens${infoIcon("owner-proof-tokens", INFO_PROOF_TOKENS)}</div>
            <p class="odash-feature-desc">
              When an agent is authorized, it receives a cryptographic proof token (PASETO v4.public) that third parties can verify independently.
            </p>
          </div>
          <div>
            <div class="odash-concept-title">Audit Trail</div>
            <p class="odash-feature-desc">
              Every action is recorded in an append-only <a href="/gui/owner/audit" class="link-green">audit log</a>. You can review all authorization decisions, approvals, and agent activity.
            </p>
          </div>
          <div>
            <div class="odash-concept-title">Learn More</div>
            <p class="odash-feature-desc">
              Visit the <a href="https://github.com/openleash/openleash" target="_blank" rel="noopener" class="link-green">OpenLeash GitHub</a> for documentation, examples, and SDK guides.
            </p>
          </div>
        </div>
      </div>
    </div>

    ${assetTags("pages/owner-dashboard/client.ts")}
  `;
    return renderPage("Dashboard", content, "/gui/owner/dashboard", "owner", renderPageOptions);
}
