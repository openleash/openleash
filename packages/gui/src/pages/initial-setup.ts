import { assetTags } from "../manifest.js";

export function renderInitialSetup(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Initial Setup - OpenLeash</title>
  ${assetTags("pages/initial-setup.ts")}
</head>
<body>
  <script>(function(){var t=localStorage.getItem('ol_theme')||'system';if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.body.classList.add('theme-light');})();</script>
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
      <button class="btn-setup" id="createInviteBtn">Create Agent Invite</button>
      <button class="btn-secondary" id="skipBtn" data-show-links>Skip for now</button>

      <div id="inviteResult" class="invite-result" style="display:none">
        <label>Agent invite URL (single use, expires in 24h)</label>
        <div id="inviteUrlBox" class="invite-url-box"></div>
        <div class="invite-hint">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
        <button class="btn-setup" style="margin-top:12px" id="btn-copy-invite">Copy to Clipboard</button>
        <button class="btn-secondary" data-show-links>Continue</button>
      </div>

      <div id="successLinks" class="success-links" style="display:none">
        <a href="/gui/dashboard">Admin Dashboard</a>
        <a id="loginLink" href="/gui/owner/login">Owner Login</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
