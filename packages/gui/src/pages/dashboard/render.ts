import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_DECISIONS,
    INFO_PROOF_TOKENS,
} from "../../shared/layout.js";
export interface DashboardData {
    state: {
        version: number;
        created_at: string;
        counts: {
            owners: number;
            agents: number;
            policies: number;
            bindings: number;
            keys: number;
        };
        active_kid: string;
    };
    health: {
        status: string;
        version: string;
    };
}

export function renderDashboard(data: DashboardData): string {
    const { state, health } = data;
    const c = state.counts;

    const needsSetup = c.owners === 0 || c.agents === 0 || c.policies === 0;

    const content = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <p>Server overview and status</p>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Owners</div>
        <div class="value">${c.owners}</div>
      </div>
      <div class="summary-card">
        <div class="label">Agents</div>
        <div class="value">${c.agents}</div>
      </div>
      <div class="summary-card">
        <div class="label">Policies</div>
        <div class="value">${c.policies}</div>
      </div>
      <div class="summary-card">
        <div class="label">Bindings</div>
        <div class="value">${c.bindings}</div>
      </div>
      <div class="summary-card">
        <div class="label">Keys</div>
        <div class="value">${c.keys}</div>
      </div>
    </div>

    ${
        needsSetup
            ? `
    <div class="card" style="border-left:3px solid var(--color-warning);margin-bottom:24px">
      <div class="card-title">Getting Started</div>
      <p style="color:var(--text-secondary);margin-bottom:16px">
        Follow these steps to set up OpenLeash and start authorizing your AI agents.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:${c.owners > 0 ? "var(--green-dark)" : "rgba(136,153,170,0.15)"};color:${c.owners > 0 ? "var(--green-bright)" : "var(--text-muted)"};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">1</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Create an Owner</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              ${
                  c.owners > 0
                      ? '<span style="color:var(--color-success)">Done</span>'
                      : 'Go to <a href="/gui/owners" style="color:var(--green-bright)">Owners</a> and create your first owner principal.'
              }
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:${c.agents > 0 ? "var(--green-dark)" : "rgba(136,153,170,0.15)"};color:${c.agents > 0 ? "var(--green-bright)" : "var(--text-muted)"};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">2</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Register an Agent</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              ${
                  c.agents > 0
                      ? '<span style="color:var(--color-success)">Done</span>'
                      : 'Go to <a href="/gui/agents" style="color:var(--green-bright)">Agents</a> and register an AI agent with an Ed25519 keypair.'
              }
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:${c.policies > 0 ? "var(--green-dark)" : "rgba(136,153,170,0.15)"};color:${c.policies > 0 ? "var(--green-bright)" : "var(--text-muted)"};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">3</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Create a Policy</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              ${
                  c.policies > 0
                      ? '<span style="color:var(--color-success)">Done</span>'
                      : 'Go to <a href="/gui/policies" style="color:var(--green-bright)">Policies</a> to define YAML-based authorization rules for your agents.'
              }
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px">
          <span style="background:rgba(136,153,170,0.15);color:var(--text-muted);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">4</span>
          <div>
            <div style="font-weight:600;color:var(--text-primary);font-size:13px">Authorize Requests</div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px">
              Use the SDK or API to send authorization requests to <span class="mono" style="font-size:11px">POST /v1/authorize</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
    `
            : ""
    }

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div class="card">
        <div class="card-title">Server Status</div>
        <table>
          <colgroup><col style="width:160px"><col></colgroup>
          <tbody>
            <tr>
              <td style="color:var(--text-muted)">Health</td>
              <td><span class="badge ${health.status === "ok" ? "badge-green" : "badge-red"}">${escapeHtml(health.status)}</span></td>
            </tr>
            <tr>
              <td style="color:var(--text-muted)">Version</td>
              <td class="mono">${escapeHtml(health.version)}</td>
            </tr>
            <tr>
              <td style="color:var(--text-muted)">State Version</td>
              <td class="mono">${state.version}</td>
            </tr>
            <tr>
              <td style="color:var(--text-muted)">Created At</td>
              <td class="mono">${formatTimestamp(state.created_at)}</td>
            </tr>
            <tr>
              <td style="color:var(--text-muted)">Active Key ID</td>
              <td>${copyableId(state.active_kid, state.active_kid.length)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Quick Links</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <a href="https://github.com/openleash/openleash" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);text-decoration:none;padding:8px 0;border-bottom:1px solid var(--border-subtle);transition:color 0.2s">
            <span class="material-symbols-outlined" style="font-size:18px;width:20px;text-align:center">code</span>
            <span>GitHub Repository</span>
          </a>
          <a href="https://github.com/openleash/openleash#readme" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);text-decoration:none;padding:8px 0;border-bottom:1px solid var(--border-subtle);transition:color 0.2s">
            <span class="material-symbols-outlined" style="font-size:18px;width:20px;text-align:center">menu_book</span>
            <span>Documentation</span>
          </a>
          <a href="/gui/api-reference" style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);text-decoration:none;padding:8px 0;border-bottom:1px solid var(--border-subtle);transition:color 0.2s">
            <span class="material-symbols-outlined" style="font-size:18px;width:20px;text-align:center">api</span>
            <span>API Reference</span>
          </a>
          <a href="/gui/mcp-glove" style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);text-decoration:none;padding:8px 0;border-bottom:1px solid var(--border-subtle);transition:color 0.2s">
            <span class="material-symbols-outlined" style="font-size:18px;width:20px;text-align:center">handshake</span>
            <span>MCP Glove</span>
          </a>
          <a href="https://github.com/openleash/openleash/issues" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);text-decoration:none;padding:8px 0;transition:color 0.2s">
            <span class="material-symbols-outlined" style="font-size:18px;width:20px;text-align:center">bug_report</span>
            <span>Report an Issue</span>
          </a>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">How It Works</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:20px">
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Owners</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            Owners are the human or organizational principals who control agents. Each owner has a unique principal ID, can hold verified identity attributes, and manages their own agents and policies through the Owner Portal.
          </p>
        </div>
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Agents</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            Agents are AI systems that need authorization to act. Each agent is registered with an Ed25519 keypair, bound to an owner, and must cryptographically sign every authorization request.
          </p>
        </div>
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Policies</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            Policies are YAML-based rules that control what agents can do. They evaluate actions, resources, and context to produce decisions${infoIcon("admin-decisions", INFO_DECISIONS)}.
          </p>
        </div>
        <div>
          <div style="font-weight:600;color:var(--text-primary);font-size:13px;margin-bottom:6px">Proof Tokens${infoIcon("admin-proof-tokens", INFO_PROOF_TOKENS)}</div>
          <p style="color:var(--text-secondary);font-size:12px;line-height:1.7">
            When an action is authorized, OpenLeash issues a PASETO v4.public cryptographic proof token. Counterparties can verify these tokens offline using the server's public key, without contacting OpenLeash.
          </p>
        </div>
      </div>
    </div>

  `;

    return renderPage("Dashboard", content, "/gui/dashboard");
}
