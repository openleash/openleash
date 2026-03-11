import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_DECISIONS,
    INFO_PROOF_TOKENS,
} from "../../shared/layout.js";
import { assetTags } from "../../shared/manifest.js";
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
    <div class="card dashboard-setup-card">
      <div class="card-title">Getting Started</div>
      <p class="dashboard-setup-intro">
        Follow these steps to set up OpenLeash and start authorizing your AI agents.
      </p>
      <div class="flex-col gap-12">
        <div class="dashboard-step">
          <span class="step-number ${c.owners > 0 ? "step-number-done" : "step-number-pending"}">1</span>
          <div>
            <div class="dashboard-step-title">Create an Owner</div>
            <div class="detail-hint">
              ${
                  c.owners > 0
                      ? '<span class="text-success">Done</span>'
                      : 'Go to <a href="/gui/owners" class="link-green">Owners</a> and create your first owner principal.'
              }
            </div>
          </div>
        </div>
        <div class="dashboard-step">
          <span class="step-number ${c.agents > 0 ? "step-number-done" : "step-number-pending"}">2</span>
          <div>
            <div class="dashboard-step-title">Register an Agent</div>
            <div class="detail-hint">
              ${
                  c.agents > 0
                      ? '<span class="text-success">Done</span>'
                      : 'Go to <a href="/gui/agents" class="link-green">Agents</a> and register an AI agent with an Ed25519 keypair.'
              }
            </div>
          </div>
        </div>
        <div class="dashboard-step">
          <span class="step-number ${c.policies > 0 ? "step-number-done" : "step-number-pending"}">3</span>
          <div>
            <div class="dashboard-step-title">Create a Policy</div>
            <div class="detail-hint">
              ${
                  c.policies > 0
                      ? '<span class="text-success">Done</span>'
                      : 'Go to <a href="/gui/policies" class="link-green">Policies</a> to define YAML-based authorization rules for your agents.'
              }
            </div>
          </div>
        </div>
        <div class="dashboard-step">
          <span class="step-number step-number-pending">4</span>
          <div>
            <div class="dashboard-step-title">Authorize Requests</div>
            <div class="detail-hint">
              Use the SDK or API to send authorization requests to <span class="mono dashboard-endpoint">POST /v1/authorize</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
    `
            : ""
    }

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-title">Server Status</div>
        <table>
          <colgroup><col style="width:160px"><col></colgroup>
          <tbody>
            <tr>
              <td class="text-muted">Health</td>
              <td><span class="badge ${health.status === "ok" ? "badge-green" : "badge-red"}">${escapeHtml(health.status)}</span></td>
            </tr>
            <tr>
              <td class="text-muted">Version</td>
              <td class="mono">${escapeHtml(health.version)}</td>
            </tr>
            <tr>
              <td class="text-muted">State Version</td>
              <td class="mono">${state.version}</td>
            </tr>
            <tr>
              <td class="text-muted">Created At</td>
              <td class="mono">${formatTimestamp(state.created_at)}</td>
            </tr>
            <tr>
              <td class="text-muted">Active Key ID</td>
              <td>${copyableId(state.active_kid, state.active_kid.length)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Quick Links</div>
        <div class="dashboard-quick-links">
          <a href="https://github.com/openleash/openleash" target="_blank" rel="noopener" class="quick-link">
            <span class="material-symbols-outlined">code</span>
            <span>GitHub Repository</span>
          </a>
          <a href="https://github.com/openleash/openleash#readme" target="_blank" rel="noopener" class="quick-link">
            <span class="material-symbols-outlined">menu_book</span>
            <span>Documentation</span>
          </a>
          <a href="/gui/api-reference" class="quick-link">
            <span class="material-symbols-outlined">api</span>
            <span>API Reference</span>
          </a>
          <a href="/gui/mcp-glove" class="quick-link">
            <span class="material-symbols-outlined">handshake</span>
            <span>MCP Glove</span>
          </a>
          <a href="https://github.com/openleash/openleash/issues" target="_blank" rel="noopener" class="quick-link">
            <span class="material-symbols-outlined">bug_report</span>
            <span>Report an Issue</span>
          </a>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">How It Works</div>
      <div class="dashboard-concepts">
        <div>
          <div class="detail-title">Owners</div>
          <p class="detail-text">
            Owners are the human or organizational principals who control agents. Each owner has a unique principal ID, can hold verified identity attributes, and manages their own agents and policies through the Owner Portal.
          </p>
        </div>
        <div>
          <div class="detail-title">Agents</div>
          <p class="detail-text">
            Agents are AI systems that need authorization to act. Each agent is registered with an Ed25519 keypair, bound to an owner, and must cryptographically sign every authorization request.
          </p>
        </div>
        <div>
          <div class="detail-title">Policies${infoIcon("admin-decisions", INFO_DECISIONS)}</div>
          <p class="detail-text">
            Policies are YAML-based rules that control what agents can do. They evaluate actions, resources, and context to produce decisions.
          </p>
        </div>
        <div>
          <div class="detail-title">Proof Tokens${infoIcon("admin-proof-tokens", INFO_PROOF_TOKENS)}</div>
          <p class="detail-text">
            When an action is authorized, OpenLeash issues a PASETO v4.public cryptographic proof token. Counterparties can verify these tokens offline using the server's public key, without contacting OpenLeash.
          </p>
        </div>
      </div>
    </div>

    ${assetTags("pages/dashboard/client.ts")}
  `;

    return renderPage("Dashboard", content, "/gui/dashboard");
}
