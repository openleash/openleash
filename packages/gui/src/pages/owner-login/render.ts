import { assetTags } from "../../shared/manifest.js";

export function renderOwnerLogin(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Owner Login - OpenLeash</title>
  ${assetTags("pages/owner-login/client.ts")}
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
          <li>An admin creates your owner account via the <a href="/gui/dashboard" class="link-green">Admin Dashboard</a> or <code>npx openleash wizard</code></li>
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
</body>
</html>`;
}
