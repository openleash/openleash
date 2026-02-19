import { renderPage, escapeHtml } from '../layout.js';

export interface DashboardData {
  state: {
    version: number;
    created_at: string;
    counts: { owners: number; agents: number; policies: number; bindings: number; keys: number };
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

    <div class="card">
      <div class="card-title">Server Status</div>
      <table>
        <tbody>
          <tr>
            <td style="width:160px;color:var(--text-muted)">Health</td>
            <td><span class="badge ${health.status === 'ok' ? 'badge-green' : 'badge-red'}">${escapeHtml(health.status)}</span></td>
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
            <td class="mono">${escapeHtml(state.created_at)}</td>
          </tr>
          <tr>
            <td style="color:var(--text-muted)">Active Key ID</td>
            <td class="mono truncate">${escapeHtml(state.active_kid)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  return renderPage('Dashboard', content, '/gui/dashboard');
}
