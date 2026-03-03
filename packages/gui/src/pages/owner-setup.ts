export function renderOwnerSetup(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Setup - OpenLeash</title>
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
      max-width: 420px;
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
    .form-group input {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 13px;
      outline: none;
    }
    .form-group input:focus {
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
    .missing-params {
      text-align: center;
      padding: 20px 0;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .missing-params a {
      color: var(--green-bright);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="setup-card">
    <h1>OpenLeash</h1>
    <div class="subtitle">Account Setup</div>
    <div id="missingParams" class="missing-params" style="display:none">
      <p>This setup link is missing required parameters.</p>
      <p>Ask your administrator to generate a new setup invite.</p>
      <p style="margin-top:16px"><a href="/gui/owner/login">Go to login</a></p>
    </div>
    <form id="setupForm" style="display:none">
      <div class="form-group">
        <label>Passphrase</label>
        <input type="password" id="passphrase" placeholder="Choose a passphrase" required>
        <div class="form-hint">Minimum 8 characters</div>
      </div>
      <div class="form-group">
        <label>Confirm Passphrase</label>
        <input type="password" id="passphraseConfirm" placeholder="Confirm your passphrase" required>
      </div>
      <button type="submit" class="btn-setup" id="submitBtn">Set Up Account</button>
      <div class="error-msg" id="errorMsg"></div>
    </form>
    <div id="successMsg" class="success-msg" style="display:none">
      <h2>Account ready</h2>
      <p>Your passphrase has been set. You can now log in.</p>
      <a id="loginLink" href="/gui/owner/login">Go to login</a>
    </div>
  </div>
  <script>
    var params = new URLSearchParams(window.location.search);
    var inviteId = params.get('invite_id');
    var inviteToken = params.get('invite_token');
    var ownerIdParam = params.get('owner_id');

    if (!inviteId || !inviteToken) {
      document.getElementById('missingParams').style.display = 'block';
    } else {
      document.getElementById('setupForm').style.display = 'block';
    }

    document.getElementById('setupForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var errorEl = document.getElementById('errorMsg');
      errorEl.style.display = 'none';

      var passphrase = document.getElementById('passphrase').value;
      var confirm = document.getElementById('passphraseConfirm').value;

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
        var res = await fetch('/v1/owner/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invite_id: inviteId,
            invite_token: inviteToken,
            passphrase: passphrase,
          }),
        });

        var data = await res.json();

        if (!res.ok) {
          errorEl.textContent = data.error ? data.error.message : 'Setup failed';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Set Up Account';
          return;
        }

        document.getElementById('setupForm').style.display = 'none';
        document.getElementById('successMsg').style.display = 'block';
        if (data.owner_principal_id) {
          document.getElementById('loginLink').href = '/gui/owner/login?owner_id=' + encodeURIComponent(data.owner_principal_id);
        } else if (ownerIdParam) {
          document.getElementById('loginLink').href = '/gui/owner/login?owner_id=' + encodeURIComponent(ownerIdParam);
        }
      } catch (err) {
        errorEl.textContent = 'Network error';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Set Up Account';
      }
    });
  </script>
</body>
</html>`;
}
