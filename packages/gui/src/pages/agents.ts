import { renderPage, escapeHtml } from '../layout.js';

export interface AgentData {
  agent_principal_id: string;
  agent_id?: string;
  owner_principal_id?: string;
  status?: string;
  created_at?: string;
  revoked_at?: string | null;
  error?: string;
}

export interface OwnerOption {
  owner_principal_id: string;
  display_name: string;
}

function statusBadge(status?: string): string {
  if (!status) return '<span class="badge badge-muted">UNKNOWN</span>';
  switch (status) {
    case 'ACTIVE': return '<span class="badge badge-green">ACTIVE</span>';
    case 'REVOKED': return '<span class="badge badge-red">REVOKED</span>';
    default: return `<span class="badge badge-muted">${escapeHtml(status)}</span>`;
  }
}

export function renderAgents(agents: AgentData[], owners: OwnerOption[]): string {
  const rows = agents.map((a) => `
    <tr>
      <td class="mono">${escapeHtml(a.agent_id ?? '-')}</td>
      <td class="mono truncate" title="${escapeHtml(a.agent_principal_id)}">${escapeHtml(a.agent_principal_id.slice(0, 8))}...</td>
      <td class="mono truncate" title="${escapeHtml(a.owner_principal_id ?? '')}">${escapeHtml((a.owner_principal_id ?? '-').slice(0, 8))}${a.owner_principal_id ? '...' : ''}</td>
      <td>${statusBadge(a.status)}</td>
      <td class="mono">${escapeHtml(a.created_at?.slice(0, 10) ?? '-')}</td>
      <td class="mono">${a.revoked_at ? escapeHtml(a.revoked_at.slice(0, 10)) : '-'}</td>
    </tr>
  `).join('');

  const ownerOptions = owners.map((o) =>
    `<option value="${escapeHtml(o.owner_principal_id)}">${escapeHtml(o.display_name)} (${escapeHtml(o.owner_principal_id.slice(0, 8))}...)</option>`
  ).join('');

  const content = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2>Agents</h2>
        <p>${agents.length} registered agent${agents.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="toggleRegForm()">+ Register Agent</button>
    </div>

    <div id="alert-container"></div>

    <div id="reg-form" class="card hidden">
      <div class="card-title">Register New Agent</div>

      <div class="form-group">
        <label for="agent-id">Agent ID</label>
        <input type="text" id="agent-id" class="form-input" placeholder="e.g. my-agent-1">
        <div class="form-help">A unique identifier for this agent</div>
      </div>

      <div class="form-group">
        <label for="owner-select">Owner</label>
        <select id="owner-select" class="form-select">
          ${ownerOptions || '<option disabled>No owners available</option>'}
        </select>
      </div>

      <div class="toolbar">
        <button id="reg-btn" class="btn btn-primary" onclick="registerAgent()">Generate Keys &amp; Register</button>
        <button class="btn btn-secondary" onclick="toggleRegForm()">Cancel</button>
        <span id="reg-status" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
    </div>

    <div id="keypair-result" class="card hidden">
      <div class="card-title" style="color:var(--amber-bright)">Save These Keys — They Cannot Be Retrieved Later</div>

      <div class="form-group">
        <label>Agent Principal ID</label>
        <div id="result-principal-id" class="key-display"></div>
      </div>

      <div class="form-group">
        <label>Public Key (base64 DER/SPKI)</label>
        <div id="result-pubkey" class="key-display"></div>
      </div>

      <div class="form-group">
        <label>Private Key (base64 DER/PKCS8)</label>
        <div id="result-privkey" class="key-display" style="color:var(--amber-bright);border-color:rgba(251,191,36,0.3)"></div>
      </div>

      <div class="toolbar">
        <button class="btn btn-primary" onclick="copyKeys()">Copy Keys to Clipboard</button>
        <button class="btn btn-secondary" onclick="document.getElementById('keypair-result').classList.add('hidden')">Dismiss</button>
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Agent ID</th>
            <th>Principal ID</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Created</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">No agents registered</td></tr>'}
        </tbody>
      </table>
    </div>

    <script>
      function toggleRegForm() {
        document.getElementById('reg-form').classList.toggle('hidden');
      }

      function b64Encode(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
      }

      async function registerAgent() {
        const agentId = document.getElementById('agent-id').value.trim();
        const ownerPrincipalId = document.getElementById('owner-select').value;
        const btn = document.getElementById('reg-btn');
        const alertContainer = document.getElementById('alert-container');
        alertContainer.innerHTML = '';

        if (!agentId) {
          alertContainer.innerHTML = '<div class="alert alert-error">Agent ID is required</div>';
          return;
        }
        if (!ownerPrincipalId) {
          alertContainer.innerHTML = '<div class="alert alert-error">Please select an owner</div>';
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Generating keys...';

        try {
          // 1. Generate Ed25519 keypair
          const keypair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
          const pubDer = await crypto.subtle.exportKey('spki', keypair.publicKey);
          const privDer = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);
          const pubB64 = b64Encode(pubDer);
          const privB64 = b64Encode(privDer);

          btn.textContent = 'Requesting challenge...';

          // 2. Request registration challenge
          const challengeRes = await fetch('/v1/agents/registration-challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent_id: agentId,
              agent_pubkey_b64: pubB64,
              owner_principal_id: ownerPrincipalId,
            }),
          });

          if (!challengeRes.ok) {
            const err = await challengeRes.json();
            throw new Error(err.error?.message || 'Failed to get challenge');
          }

          const challenge = await challengeRes.json();

          btn.textContent = 'Signing challenge...';

          // 3. Sign the challenge
          const challengeBytes = Uint8Array.from(atob(challenge.challenge_b64), c => c.charCodeAt(0));
          const signature = await crypto.subtle.sign('Ed25519', keypair.privateKey, challengeBytes);
          const sigB64 = b64Encode(signature);

          btn.textContent = 'Registering...';

          // 4. Register the agent
          const regRes = await fetch('/v1/agents/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              challenge_id: challenge.challenge_id,
              agent_id: agentId,
              agent_pubkey_b64: pubB64,
              signature_b64: sigB64,
              owner_principal_id: ownerPrincipalId,
            }),
          });

          if (!regRes.ok) {
            const err = await regRes.json();
            throw new Error(err.error?.message || 'Registration failed');
          }

          const result = await regRes.json();

          // 5. Show the keypair
          document.getElementById('result-principal-id').textContent = result.agent_principal_id;
          document.getElementById('result-pubkey').textContent = pubB64;
          document.getElementById('result-privkey').textContent = privB64;
          document.getElementById('keypair-result').classList.remove('hidden');
          document.getElementById('reg-form').classList.add('hidden');

          alertContainer.innerHTML = '<div class="alert alert-success">Agent \\'' + agentId.replace(/</g, '&lt;') + '\\' registered successfully. Save the keys below!</div>';

          // Reset form
          document.getElementById('agent-id').value = '';

        } catch (err) {
          alertContainer.innerHTML = '<div class="alert alert-error">' + String(err.message || err).replace(/</g, '&lt;') + '</div>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Generate Keys & Register';
        }
      }

      async function copyKeys() {
        const principalId = document.getElementById('result-principal-id').textContent;
        const pubKey = document.getElementById('result-pubkey').textContent;
        const privKey = document.getElementById('result-privkey').textContent;
        const text = 'Agent Principal ID: ' + principalId + '\\nPublic Key (base64): ' + pubKey + '\\nPrivate Key (base64): ' + privKey;
        await navigator.clipboard.writeText(text);
        const btn = event.target;
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      }
    </script>
  `;

  return renderPage('Agents', content, '/gui/agents');
}
