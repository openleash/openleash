import { assetTags } from "../../shared/manifest.js";

export function renderOwnerSetup(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Setup - OpenLeash</title>
  ${assetTags("pages/owner-setup/client.ts")}
</head>
<body>
  <script>(function(){var t=localStorage.getItem('ol_theme')||'system';if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.body.classList.add('theme-light');})();</script>
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
      <p>Your passphrase has been set.</p>

      <hr class="divider">

      <p style="margin-bottom:12px">Would you like to register an agent?</p>
      <button class="btn-setup" id="createInviteBtn">Create Agent Invite</button>
      <button class="btn-secondary" id="skipBtn" data-go-to-login>Skip for now</button>

      <div id="inviteResult" class="invite-result" style="display:none">
        <label>Agent invite URL (single use, expires in 24h)</label>
        <div id="inviteUrlBox" class="invite-url-box"></div>
        <div class="invite-hint">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
        <button class="btn-setup" style="margin-top:12px" id="btn-copy-invite">Copy to Clipboard</button>
        <button class="btn-secondary" data-go-to-login>Continue to login</button>
      </div>
    </div>
  </div>
</body>
</html>`;
}
