import { assetTags } from "../../shared/manifest.js";

export function renderOwnerSetup(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Setup - OpenLeash</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 120 120' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2334d399'/%3E%3Cstop offset='100%25' stop-color='%23065f46'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M60 10C32 10 18 30 18 48C18 66 32 80 46 84L46 88L54 88L54 84C54 84 60 86 66 84L66 88L74 88L74 84C88 80 102 66 102 48C102 30 88 10 60 10Z' fill='url(%23g)'/%3E%3Cpath d='M22 38C8 34 2 43 6 52C10 61 20 57 24 48C27 42 24 38 22 38Z' fill='url(%23g)'/%3E%3Cpath d='M98 38C112 34 118 43 114 52C110 61 100 57 96 48C93 42 96 38 98 38Z' fill='url(%23g)'/%3E%3Ccircle cx='45' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='75' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='46' cy='29' r='2' fill='%23fbbf24'/%3E%3Ccircle cx='76' cy='29' r='2' fill='%23fbbf24'/%3E%3Cpath d='M28 56C42 64 78 64 92 56' stroke='%23fbbf24' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3Cpath d='M60 62L60 98Q58 106 50 108' stroke='%23fbbf24' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3Cellipse cx='45' cy='109' rx='8' ry='4.5' fill='none' stroke='%23fbbf24' stroke-width='3'/%3E%3C/svg%3E">
  ${assetTags("pages/owner-setup/client.ts")}
</head>
<body>
  <script>(function(){var t=localStorage.getItem('ol_theme')||'system';if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.body.classList.add('theme-light');})();</script>
  <div class="setup-card">
    <h1>OpenLeash</h1>
    <div class="subtitle">Account Setup</div>
    <div id="missing-params" class="missing-params osetup-hidden">
      <p>This setup link is missing required parameters.</p>
      <p>Ask your administrator to generate a new setup invite.</p>
      <p class="osetup-login-link"><a href="/gui/owner/login">Go to login</a></p>
    </div>
    <form id="setup-form" class="osetup-hidden">
      <div class="form-group">
        <label>Passphrase</label>
        <input type="password" id="passphrase" placeholder="Choose a passphrase" required>
        <div class="form-hint">Minimum 8 characters</div>
      </div>
      <div class="form-group">
        <label>Confirm Passphrase</label>
        <input type="password" id="passphrase-confirm" placeholder="Confirm your passphrase" required>
      </div>
      <button type="submit" class="btn-setup" id="submit-btn">Set Up Account</button>
      <div class="error-msg" id="error-msg"></div>
    </form>
    <div id="success-msg" class="success-msg osetup-hidden">
      <h2>Account ready</h2>
      <p>Your passphrase has been set.</p>

      <hr class="divider">

      <p class="osetup-prompt-text">Would you like to register an agent?</p>
      <button class="btn-setup" id="create-invite-btn">Create Agent Invite</button>
      <button class="btn-secondary" id="skip-btn" data-go-to-login>Skip for now</button>

      <div id="invite-result" class="invite-result osetup-hidden">
        <label>Agent invite URL (single use, expires in 24h)</label>
        <div id="invite-url-box" class="invite-url-box"></div>
        <div class="invite-hint">Copy this URL and give it to your agent. It contains everything the agent needs to register itself.</div>
        <button class="btn-setup osetup-btn-copy" id="btn-copy-invite">Copy to Clipboard</button>
        <button class="btn-secondary" data-go-to-login>Continue to login</button>
      </div>
    </div>
  </div>
</body>
</html>`;
}
