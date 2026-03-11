import {
    renderPage,
    escapeHtml,
    copyableId,
    formatTimestamp,
    infoIcon,
    INFO_AGENT_STATUS,
} from "../layout.js";

export interface OwnerAgentEntry {
    agent_principal_id: string;
    agent_id: string;
    status: string;
    created_at: string;
    revoked_at: string | null;
}

export interface OwnerAgentsOptions {
    totp_enabled?: boolean;
    require_totp?: boolean;
}

export function renderOwnerAgents(agents: OwnerAgentEntry[], options?: OwnerAgentsOptions): string {
    const totpEnabled = options?.totp_enabled ?? false;
    const requireTotp = options?.require_totp ?? false;
    const disableActions = requireTotp && !totpEnabled;
    const rows =
        agents.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No agents registered</td></tr>'
            : agents
                  .map((a) => {
                      const badge = a.status === "ACTIVE" ? "badge-green" : "badge-red";
                      return `
      <tr>
        <td>${copyableId(a.agent_id, a.agent_id.length)}</td>
        <td>${copyableId(a.agent_principal_id)}</td>
        <td><span class="badge ${badge}">${escapeHtml(a.status)}</span></td>
        <td>${formatTimestamp(a.created_at)}</td>
        <td>
          ${
              a.status === "ACTIVE"
                  ? `<button class="btn btn-secondary" style="font-size:12px;padding:4px 12px;border-color:var(--red-bright);color:var(--red-bright)" onclick="revokeAgent('${a.agent_principal_id}')" ${disableActions ? "disabled" : ""}>Revoke</button>`
                  : '<span style="color:var(--text-muted)">-</span>'
          }
        </td>
      </tr>`;
                  })
                  .join("");

    const content = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2>My Agents</h2>
      <button class="btn btn-primary" onclick="createAgentInvite()">+ Create Agent Invite</button>
    </div>

    ${
        requireTotp && !totpEnabled
            ? '<div class="alert alert-error" style="margin-bottom:16px">Two-factor authentication is required to revoke agents. <a href="/gui/owner/profile" style="color:inherit;text-decoration:underline">Set up 2FA in your Profile.</a></div>'
            : ""
    }

    <div id="alert-container"></div>

    <div id="invite-result" class="card" style="display:none;border-color:rgba(251,191,36,0.3)">
      <div style="font-size:13px;font-weight:600;color:var(--amber-bright);margin-bottom:12px">Agent Invite URL (single use, expires in 24h)</div>
      <div id="invite-url" style="padding:10px 14px;background:var(--bg-elevated);border:1px solid rgba(251,191,36,0.3);border-radius:8px;font-family:var(--font-mono);font-size:12px;word-break:break-all;line-height:1.5;color:var(--text-primary)"></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-primary" style="font-size:12px;padding:6px 16px" onclick="copyInviteUrl()">Copy to Clipboard</button>
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 16px" onclick="document.getElementById('invite-result').style.display='none'">Dismiss</button>
      </div>
    </div>

    <div class="card" style="padding:0;margin-top:20px">
      <table>
        <colgroup><col><col style="width:290px"><col style="width:130px"><col style="width:170px"><col style="width:140px"></colgroup>
        <thead>
          <tr><th>Agent ID</th><th>Principal ID</th><th>Status${infoIcon("owner-agent-status", INFO_AGENT_STATUS)}</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>
      var totpEnabled = ${totpEnabled};

      async function revokeAgent(principalId) {
        if (!await olConfirm('Are you sure you want to revoke this agent?', 'Revoke Agent')) return;
        var token = sessionStorage.getItem('openleash_session');
        var bodyObj = { status: 'REVOKED' };
        if (totpEnabled) {
          var code = await olPrompt('Enter your 2FA code:', '000000', 'Two-Factor Authentication');
          if (!code) return;
          bodyObj.totp_code = code;
        }
        var res = await fetch('/v1/owner/agents/' + principalId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(bodyObj),
        });
        if (res.ok) window.location.reload();
        else {
          var data = await res.json().catch(function() { return {}; });
          olAlert(data.error?.message || 'Failed to revoke agent', 'Error');
        }
      }

      async function createAgentInvite() {
        var token = sessionStorage.getItem('openleash_session');
        var alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        try {
          var res = await fetch('/v1/owner/agent-invites', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
            },
            body: '{}',
          });

          if (!res.ok) throw new Error('Failed to create invite');

          var data = await res.json();
          var baseUrl = window.location.origin;
          var inviteUrl = baseUrl + '/v1/agents/register-with-invite?invite_id=' + encodeURIComponent(data.invite_id) + '&invite_token=' + encodeURIComponent(data.invite_token);

          document.getElementById('invite-url').textContent = inviteUrl;
          document.getElementById('invite-result').style.display = 'block';
        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">Failed to create agent invite</div>';
        }
      }

      async function copyInviteUrl() {
        var url = document.getElementById('invite-url').textContent;
        await navigator.clipboard.writeText(url);
        var btn = event.target;
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
      }
    </script>
  `;
    return renderPage("My Agents", content, "/gui/owner/agents", "owner");
}
