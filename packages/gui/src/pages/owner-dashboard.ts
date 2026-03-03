import { renderPage } from '../layout.js';

export interface OwnerDashboardData {
  display_name: string;
  agent_count: number;
  policy_count: number;
  pending_approvals: number;
}

export function renderOwnerDashboard(data: OwnerDashboardData): string {
  const content = `
    <h2>Welcome, ${data.display_name}</h2>
    <div class="card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:20px">
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
    </div>
    ${data.pending_approvals > 0 ? `
    <div class="card" style="padding:16px;margin-top:20px;border-left:3px solid var(--amber-bright)">
      <span style="color:var(--amber-bright)">You have ${data.pending_approvals} pending approval request${data.pending_approvals > 1 ? 's' : ''}.</span>
      <a href="/gui/owner/approvals" style="color:var(--green-bright);margin-left:8px">Review now</a>
    </div>` : ''}
  `;
  return renderPage('Dashboard', content, '/gui/owner/dashboard', 'owner');
}
