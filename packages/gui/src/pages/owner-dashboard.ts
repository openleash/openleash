import { renderPage, escapeHtml, infoIcon, INFO_DECISIONS } from '../layout.js';

export interface OwnerDashboardData {
  display_name: string;
  agent_count: number;
  policy_count: number;
  pending_approvals: number;
  pending_policy_drafts: number;
}

export function renderOwnerDashboard(data: OwnerDashboardData): string {
  const needsSetup = data.agent_count === 0 || data.policy_count === 0;

  const content = `
    <div class="page-header">
      <h2>Welcome, ${escapeHtml(data.display_name)}</h2>
      <p>Manage your agents, policies, and approval requests</p>
    </div>

    <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px">
      <div class="card" style="padding:20px">
        <div style="font-size:28px;font-weight:700;color:var(--green-bright)">${data.agent_count}</div>
        <div style="color:var(--text-secondary);font-size:13px;margin-top:4px">My Agents</div>
      </div>
      <div class="card" style="padding:20px">
        <div style="font-size:28px;font-weight:700;color:var(--green-bright)">${data.policy_count}</div>
        <div style="color:var(--text-secondary);font-size:13px;margin-top:4px">My Policies</div>
      </div>
      <div class="card" style="padding:20px">
        <div style="font-size:28px;font-weight:700;color:${data.pending_approvals > 0 ? 'var(--amber-bright)' : 'var(--green-bright)'}">${data.pending_approvals}</div>
        <div style="color:var(--text-secondary);font-size:13px;margin-top:4px">Pending Approvals</div>
      </div>
      <div class="card" style="padding:20px">
        <div style="font-size:28px;font-weight:700;color:${data.pending_policy_drafts > 0 ? 'var(--amber-bright)' : 'var(--green-bright)'}">${data.pending_policy_drafts}</div>
        <div style="color:var(--text-secondary);font-size:13px;margin-top:4px">Policy Drafts</div>
      </div>
    </div>

    ${data.pending_approvals > 0 ? `
    <div class="card" style="padding:16px;margin-bottom:24px;border-left:3px solid var(--amber-bright)">
      <span style="color:var(--amber-bright)">You have ${data.pending_approvals} pending approval request${data.pending_approvals > 1 ? 's' : ''}.</span>
      <a href="/gui/owner/approvals" style="color:var(--green-bright);margin-left:8px">Review now</a>
    </div>` : ''}

    ${data.pending_policy_drafts > 0 ? `
    <div class="card" style="padding:16px;margin-bottom:24px;border-left:3px solid var(--amber-bright)">
      <span style="color:var(--amber-bright)">You have ${data.pending_policy_drafts} pending policy draft${data.pending_policy_drafts > 1 ? 's' : ''} from your agents.</span>
      <a href="/gui/owner/policy-drafts" style="color:var(--green-bright);margin-left:8px">Review now</a>
    </div>` : ''}

    ${needsSetup ? `
    <div class="card" style="border-left:3px solid var(--amber-bright);margin-bottom:24px">
      <div class="card-title">Getting Started</div>
      <p style="color:var(--text-secondary);margin-bottom:16px;font-size:13px">
        Set up your agents and policies to start using OpenLeash authorization.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span class="material-symbols-outlined" style="background:var(--green-dark);color:var(--green-bright);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">check</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Account Created</div>
            <div style="color:var(--green-bright);font-size:12px;margin-top:2px">You're logged in as ${escapeHtml(data.display_name)}.</div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:${data.agent_count > 0 ? 'var(--green-dark)' : 'rgba(136,153,170,0.15)'};color:${data.agent_count > 0 ? 'var(--green-bright)' : 'var(--text-muted)'};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Register Your Agents</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              ${data.agent_count > 0
                ? '<span style="color:var(--green-bright)">Done</span>'
                : 'Your administrator will register agents on your behalf. They will appear in <a href="/gui/owner/agents" style="color:var(--green-bright)">My Agents</a>.'}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:${data.policy_count > 0 ? 'var(--green-dark)' : 'rgba(136,153,170,0.15)'};color:${data.policy_count > 0 ? 'var(--green-bright)' : 'var(--text-muted)'};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Create Policies</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              ${data.policy_count > 0
                ? '<span style="color:var(--green-bright)">Done</span>'
                : 'Go to <a href="/gui/owner/policies" style="color:var(--green-bright)">My Policies</a> and write YAML rules that control what your agents can do.'}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:rgba(136,153,170,0.15);color:var(--text-muted);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Review Approval Requests</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              When your policies use REQUIRE_APPROVAL, agents will ask for your permission in <a href="/gui/owner/approvals" style="color:var(--green-bright)">Approvals</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div class="card">
        <div class="card-title">What You Can Do</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <a href="/gui/owner/agents" style="font-weight:600;color:var(--green-bright);font-size:13px;text-decoration:none">My Agents</a>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              View all AI agents registered under your account. You can see their status and revoke access to any agent that should no longer act on your behalf.
            </p>
          </div>
          <div>
            <a href="/gui/owner/policies" style="font-weight:600;color:var(--green-bright);font-size:13px;text-decoration:none">My Policies</a>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Create and edit YAML-based authorization policies. Policies define which actions your agents are allowed or denied, and can require human approval for sensitive operations.
            </p>
          </div>
          <div>
            <a href="/gui/owner/approvals" style="font-weight:600;color:var(--green-bright);font-size:13px;text-decoration:none">Approvals</a>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Review and approve or deny requests from your agents. When a policy requires human approval, the agent's request appears here for you to review.
            </p>
          </div>
          <div>
            <a href="/gui/owner/policy-drafts" style="font-weight:600;color:var(--green-bright);font-size:13px;text-decoration:none">Policy Drafts</a>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Your agents can propose new policies when they need access to action types not yet covered. Review the proposed YAML and approve or deny each draft.
            </p>
          </div>
          <div>
            <a href="/gui/owner/profile" style="font-weight:600;color:var(--green-bright);font-size:13px;text-decoration:none">Profile</a>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Manage your identity information, including contact details, government IDs, and company identifiers. Higher identity assurance levels unlock more capabilities.
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Key Concepts</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Policy Decisions${infoIcon('owner-decisions', INFO_DECISIONS)}</div>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Policies evaluate to one of five decisions: <span class="badge badge-green">ALLOW</span> <span class="badge badge-red">DENY</span> <span class="badge badge-amber">REQUIRE_APPROVAL</span> <span class="badge badge-amber">REQUIRE_STEP_UP</span> <span class="badge badge-amber">REQUIRE_DEPOSIT</span>
            </p>
          </div>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Proof Tokens</div>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              When an agent is authorized, it receives a cryptographic proof token (PASETO v4.public) that third parties can verify independently.
            </p>
          </div>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Audit Trail</div>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Every action is recorded in an append-only <a href="/gui/owner/audit" style="color:var(--green-bright)">audit log</a>. You can review all authorization decisions, approvals, and agent activity.
            </p>
          </div>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Learn More</div>
            <p style="color:var(--text-secondary);font-size:12px;margin-top:2px;line-height:1.6">
              Visit the <a href="https://github.com/openleash/openleash" target="_blank" rel="noopener" style="color:var(--green-bright)">OpenLeash GitHub</a> for documentation, examples, and SDK guides.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
  return renderPage('Dashboard', content, '/gui/owner/dashboard', 'owner');
}
