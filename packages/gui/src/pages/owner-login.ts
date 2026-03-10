export function renderOwnerLogin(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Owner Login - OpenLeash</title>
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
      --amber-bright: #fbbf24;
      --red-bright: #f87171;
      --text-primary: #e8f0f8;
      --text-secondary: #8899aa;
      --text-muted: #556677;
      --border-subtle: rgba(136, 153, 170, 0.15);
      --border-accent: rgba(52, 211, 153, 0.3);
      --radius-md: 12px;
    }
    body.theme-light {
      --bg-deep: #f5f7fa;
      --bg-surface: #ffffff;
      --bg-elevated: #f0f2f5;
      --green-bright: #047e58;
      --green-mid: #059669;
      --green-dark: #d1fae5;
      --amber-bright: #a75b04;
      --red-bright: #d72222;
      --text-primary: #1a1a2e;
      --text-secondary: #4a5568;
      --text-muted: #5c708c;
      --border-subtle: rgba(0, 0, 0, 0.1);
      --border-accent: rgba(4, 126, 88, 0.3);
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
    .login-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 40px;
      width: 100%;
      max-width: 420px;
    }
    .login-card h1 {
      color: var(--green-bright);
      font-size: 22px;
      margin-bottom: 4px;
    }
    .login-card .subtitle {
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
    .btn-login {
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
    .btn-login:hover {
      filter: brightness(1.1);
    }
    .error-msg {
      color: var(--red-bright);
      font-size: 13px;
      margin-top: 12px;
      display: none;
    }
    .admin-link {
      display: block;
      text-align: center;
      margin-top: 20px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .admin-link a {
      color: var(--green-bright);
      text-decoration: none;
    }
    .help-section {
      margin-top: 24px;
      border-top: 1px solid var(--border-subtle);
      padding-top: 16px;
    }
    .help-section summary {
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .help-section summary:hover {
      color: var(--text-secondary);
    }
    .help-steps {
      margin-top: 12px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.7;
    }
    .help-steps ol {
      padding-left: 18px;
    }
    .help-steps li {
      margin-bottom: 6px;
    }
    .help-steps code {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--bg-elevated);
      padding: 1px 5px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <script>(function(){var t=localStorage.getItem('ol_theme')||'system';if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.body.classList.add('theme-light');})();</script>
  <div class="login-card">
    <h1>OpenLeash</h1>
    <div class="subtitle">Owner Portal</div>
    <form id="loginForm">
      <div class="form-group">
        <label>Owner Principal ID</label>
        <input type="text" id="ownerId" placeholder="00000000-0000-0000-0000-000000000000" required>
      </div>
      <div class="form-group">
        <label>Passphrase</label>
        <input type="password" id="passphrase" placeholder="Enter your passphrase" required>
      </div>
      <button type="submit" class="btn-login">Sign In</button>
      <div class="error-msg" id="errorMsg"></div>
    </form>
    <details class="help-section">
      <summary>First time? How to set up your account</summary>
      <div class="help-steps">
        <ol>
          <li>An admin creates your owner account via the <a href="/gui/dashboard" style="color: var(--green-bright); text-decoration: none;">Admin Dashboard</a> or <code>npx openleash wizard</code></li>
          <li>The admin generates a setup invite for you</li>
          <li>Open the setup link to choose your passphrase</li>
          <li>Log in above with your Owner Principal ID and passphrase</li>
        </ol>
      </div>
    </details>
    <div class="admin-link">
      <a href="/gui/dashboard">Admin Dashboard</a>
    </div>
  </div>
  <script>
    (function() {
      var p = new URLSearchParams(window.location.search);
      var oid = p.get('owner_id');
      if (oid) document.getElementById('ownerId').value = oid;
    })();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('errorMsg');
      errorEl.style.display = 'none';

      const ownerId = document.getElementById('ownerId').value.trim();
      const passphrase = document.getElementById('passphrase').value;

      try {
        const res = await fetch('/v1/owner/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner_principal_id: ownerId, passphrase }),
        });

        const data = await res.json();

        if (!res.ok) {
          errorEl.textContent = data.error?.message || 'Login failed';
          errorEl.style.display = 'block';
          return;
        }

        // Store token in sessionStorage and cookie
        sessionStorage.setItem('openleash_session', data.token);
        document.cookie = 'openleash_session=' + data.token + '; path=/; SameSite=Strict';

        window.location.href = '/gui/owner/dashboard';
      } catch (err) {
        errorEl.textContent = 'Network error';
        errorEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
}
