export function renderInitialSetup(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Initial Setup - OpenLeash</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --font-body: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
      --bg-deep: #050a0e;
      --bg-surface: #0a1118;
      --bg-elevated: #111d28;
      --green-bright: #34d399;
      --green-mid: #10b981;
      --green-dark: #065f46;
      --red-bright: #f87171;
      --amber-bright: #fbbf24;
      --text-primary: #e8f0f8;
      --text-secondary: #8899aa;
      --text-muted: #556677;
      --border-subtle: rgba(136, 153, 170, 0.15);
      --radius-md: 12px;
    }
    html { -webkit-font-smoothing: antialiased; }
    body {
      font-family: var(--font-body);
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-deep);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .setup-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 40px;
      width: 100%;
      max-width: 480px;
    }
    .setup-card h1 {
      color: var(--green-bright);
      font-size: 22px;
      margin-bottom: 4px;
    }
    .setup-card .subtitle {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 28px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    .form-group label {
      display: block;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .form-group input, .form-group select {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: var(--font-body);
      font-size: 13px;
      outline: none;
    }
    .form-group input[type="password"] {
      font-family: var(--font-mono);
    }
    .form-group input:focus, .form-group select:focus {
      border-color: var(--green-bright);
    }
    .form-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .btn-setup {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, var(--green-dark), var(--green-mid));
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
    }
    .btn-setup:hover {
      filter: brightness(1.1);
    }
    .btn-setup:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-secondary {
      width: 100%;
      padding: 12px;
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      margin-top: 8px;
    }
    .btn-secondary:hover {
      color: var(--text-primary);
      border-color: var(--text-secondary);
    }
    .error-msg {
      color: var(--red-bright);
      font-size: 13px;
      margin-top: 12px;
      display: none;
    }
    .success-msg {
      text-align: center;
      padding: 20px 0;
    }
    .success-msg h2 {
      color: var(--green-bright);
      font-size: 18px;
      margin-bottom: 8px;
    }
    .success-msg p {
      color: var(--text-secondary);
      font-size: 13px;
      margin-bottom: 16px;
    }
    .success-msg a {
      color: var(--green-bright);
      text-decoration: none;
      font-weight: 600;
    }
    .success-links {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    .success-links a {
      display: block;
      padding: 10px 16px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--green-bright);
      text-decoration: none;
      font-size: 13px;
      text-align: center;
    }
    .success-links a:hover {
      border-color: var(--green-bright);
    }
    .invite-result {
      margin-top: 16px;
    }
    .invite-result label {
      display: block;
      font-size: 12px;
      color: var(--amber-bright);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .invite-url-box {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg-elevated);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 12px;
      word-break: break-all;
      line-height: 1.5;
    }
    .invite-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--border-subtle);
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="setup-card">
    <h1>OpenLeash</h1>
    <div class="subtitle">Initial Setup</div>
    <form id="setupForm">
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" id="displayName" placeholder="Your name or organization" required>
      </div>
      <div class="form-group">
        <label>Principal Type</label>
        <select id="principalType">
          <option value="HUMAN">Human</option>
          <option value="ORG">Organization</option>
        </select>
      </div>
      <div class="form-group">
        <label>Passphrase</label>
        <input type="password" id="passphrase" placeholder="Choose a passphrase" required>
        <div class="form-hint">Minimum 8 characters</div>
      </div>
      <div class="form-group">
        <label>Confirm Passphrase</label>
        <input type="password" id="passphraseConfirm" placeholder="Confirm your passphrase" required>
      </div>
      <button type="submit" class="btn-setup" id="submitBtn">Create Owner</button>
      <div class="error-msg" id="errorMsg"></div>
    </form>
    <div id="successMsg" class="success-msg" style="display:none">
      <h2>Setup complete</h2>
      <p>Your owner account has been created.</p>

      <hr class="divider">

      <p style="margin-bottom:12px">Would you like to register an agent?</p>
      <button class="btn-setup" id="createInviteBtn" onclick="createAgentInvite()">Create Agent Invite</button>
      <button class="btn-secondary" id="skipBtn" onclick="showLinks()">Skip for now</button>

      <div id="inviteResult" class="invite-result" style="display:none">
        <label>Agent invite URL (single use, expires in 24h)</label>
        <div id="inviteUrlBox" class="invite-url-box"></div>
        <div class="invite-hint">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
        <button class="btn-setup" style="margin-top:12px" onclick="copyInviteUrl()">Copy to Clipboard</button>
        <button class="btn-secondary" onclick="showLinks()">Continue</button>
      </div>

      <div id="successLinks" class="success-links" style="display:none">
        <a href="/gui/dashboard">Admin Dashboard</a>
        <a id="loginLink" href="/gui/owner/login">Owner Login</a>
      </div>
    </div>
  </div>
  <script>
    var sessionToken = null;
    var ownerPrincipalId = null;

    function showLinks() {
      document.getElementById('createInviteBtn').style.display = 'none';
      document.getElementById('skipBtn').style.display = 'none';
      document.getElementById('successLinks').style.display = 'flex';
    }

    document.getElementById('setupForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var errorEl = document.getElementById('errorMsg');
      errorEl.style.display = 'none';

      var displayName = document.getElementById('displayName').value.trim();
      var principalType = document.getElementById('principalType').value;
      var passphrase = document.getElementById('passphrase').value;
      var confirm = document.getElementById('passphraseConfirm').value;

      if (!displayName) {
        errorEl.textContent = 'Display name is required';
        errorEl.style.display = 'block';
        return;
      }

      if (passphrase !== confirm) {
        errorEl.textContent = 'Passphrases do not match';
        errorEl.style.display = 'block';
        return;
      }

      if (passphrase.length < 8) {
        errorEl.textContent = 'Passphrase must be at least 8 characters';
        errorEl.style.display = 'block';
        return;
      }

      var btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Setting up...';

      try {
        var res = await fetch('/v1/initial-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: displayName,
            principal_type: principalType,
            passphrase: passphrase,
          }),
        });

        var data = await res.json();

        if (!res.ok) {
          errorEl.textContent = data.error ? data.error.message : 'Setup failed';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Create Owner';
          return;
        }

        ownerPrincipalId = data.owner_principal_id;

        // Auto-login to get session token for agent invite creation
        if (ownerPrincipalId) {
          document.getElementById('loginLink').href = '/gui/owner/login?owner_id=' + encodeURIComponent(ownerPrincipalId);
          try {
            var loginRes = await fetch('/v1/owner/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                owner_principal_id: ownerPrincipalId,
                passphrase: passphrase,
              }),
            });
            if (loginRes.ok) {
              var loginData = await loginRes.json();
              sessionToken = loginData.token;
            }
          } catch (_) {
            // Login failed — agent invite won't be available
          }
        }

        document.getElementById('setupForm').style.display = 'none';
        document.getElementById('successMsg').style.display = 'block';

        // If login failed, skip invite option and show links directly
        if (!sessionToken) {
          document.getElementById('createInviteBtn').style.display = 'none';
          document.getElementById('skipBtn').style.display = 'none';
          document.getElementById('successLinks').style.display = 'flex';
        }
      } catch (err) {
        errorEl.textContent = 'Network error';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create Owner';
      }
    });

    async function createAgentInvite() {
      var btn = document.getElementById('createInviteBtn');
      btn.disabled = true;
      btn.textContent = 'Creating invite...';

      try {
        var res = await fetch('/v1/owner/agent-invites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionToken,
          },
          body: '{}',
        });

        if (!res.ok) throw new Error('Failed to create invite');

        var data = await res.json();
        var baseUrl = window.location.origin;
        var inviteUrl = baseUrl + '/v1/agents/register-with-invite?invite_id=' + encodeURIComponent(data.invite_id) + '&invite_token=' + encodeURIComponent(data.invite_token);

        document.getElementById('inviteUrlBox').textContent = inviteUrl;
        document.getElementById('inviteResult').style.display = 'block';
        btn.style.display = 'none';
        document.getElementById('skipBtn').style.display = 'none';
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Create Agent Invite';
        alert('Failed to create agent invite');
      }
    }

    async function copyInviteUrl() {
      var url = document.getElementById('inviteUrlBox').textContent;
      await navigator.clipboard.writeText(url);
      var btn = event.target;
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = orig; }, 2000);
    }
  </script>
</body>
</html>`;
}
