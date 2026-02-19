import { renderPage, escapeHtml } from '../layout.js';

export interface ConfigData {
  server: { bind_address: string };
  admin: { mode: string; token_set: boolean; allow_remote_admin: boolean };
  security: { nonce_ttl_seconds: number; clock_skew_seconds: number };
  tokens: { format: string; default_ttl_seconds: number; max_ttl_seconds: number };
  gui?: { enabled: boolean };
}

function renderSection(title: string, entries: [string, string][]): string {
  const rows = entries.map(([key, val]) => `
    <tr>
      <td style="width:200px;color:var(--text-muted)">${escapeHtml(key)}</td>
      <td class="mono">${escapeHtml(val)}</td>
    </tr>
  `).join('');

  return `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <table><tbody>${rows}</tbody></table>
    </div>
  `;
}

export function renderConfig(data: ConfigData): string {
  const content = `
    <div class="page-header">
      <h2>Configuration</h2>
      <p>Current server configuration (read-only)</p>
    </div>

    ${renderSection('Server', [
      ['Bind Address', data.server.bind_address],
    ])}

    ${renderSection('Admin', [
      ['Mode', data.admin.mode],
      ['Token Set', data.admin.token_set ? 'Yes' : 'No'],
      ['Allow Remote Admin', data.admin.allow_remote_admin ? 'Yes' : 'No'],
    ])}

    ${renderSection('Security', [
      ['Nonce TTL', `${data.security.nonce_ttl_seconds}s`],
      ['Clock Skew', `${data.security.clock_skew_seconds}s`],
    ])}

    ${renderSection('Tokens', [
      ['Format', data.tokens.format],
      ['Default TTL', `${data.tokens.default_ttl_seconds}s`],
      ['Max TTL', `${data.tokens.max_ttl_seconds}s`],
    ])}

    ${data.gui ? renderSection('GUI', [
      ['Enabled', data.gui.enabled ? 'Yes' : 'No'],
    ]) : ''}
  `;

  return renderPage('Configuration', content, '/gui/config');
}
