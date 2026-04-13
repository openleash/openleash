import { assetTags } from "../../shared/manifest.js";
import { authBrandHtml } from "../../shared/layout.js";

export interface OwnerLoginOptions {
    hosted?: boolean;
}

export function renderOwnerLogin(options?: OwnerLoginOptions): string {
    const hosted = options?.hosted ?? false;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Owner Login - OpenLeash</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 120 120' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2334d399'/%3E%3Cstop offset='100%25' stop-color='%23065f46'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M60 10C32 10 18 30 18 48C18 66 32 80 46 84L46 88L54 88L54 84C54 84 60 86 66 84L66 88L74 88L74 84C88 80 102 66 102 48C102 30 88 10 60 10Z' fill='url(%23g)'/%3E%3Cpath d='M22 38C8 34 2 43 6 52C10 61 20 57 24 48C27 42 24 38 22 38Z' fill='url(%23g)'/%3E%3Cpath d='M98 38C112 34 118 43 114 52C110 61 100 57 96 48C93 42 96 38 98 38Z' fill='url(%23g)'/%3E%3Ccircle cx='45' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='75' cy='30' r='5.5' fill='%23050a0e'/%3E%3Ccircle cx='46' cy='29' r='2' fill='%23fbbf24'/%3E%3Ccircle cx='76' cy='29' r='2' fill='%23fbbf24'/%3E%3Cpath d='M28 56C42 64 78 64 92 56' stroke='%23fbbf24' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3Cpath d='M60 62L60 98Q58 106 50 108' stroke='%23fbbf24' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3Cellipse cx='45' cy='109' rx='8' ry='4.5' fill='none' stroke='%23fbbf24' stroke-width='3'/%3E%3C/svg%3E">
  ${assetTags("pages/owner-login/client.ts")}
</head>
<body>
  <script>(function(){var t=localStorage.getItem('ol_theme')||'system';if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.body.classList.add('theme-light');})();</script>
  <div class="login-card">
    ${authBrandHtml("Owner Portal")}
    <form id="login-form">
      <div class="form-group">
        <label>Owner Principal ID</label>
        <input type="text" id="owner-id" placeholder="00000000-0000-0000-0000-000000000000" required>
      </div>
      <div class="form-group">
        <label>Passphrase</label>
        <input type="password" id="passphrase" placeholder="Enter your passphrase" required>
      </div>
      <label class="remember-me"><input type="checkbox" id="login-remember" checked> Remember me</label>
      <button type="submit" class="btn-login">Sign In</button>
      <div class="error-msg" id="error-msg"></div>
    </form>
    ${hosted ? "" : `<details class="help-section">
      <summary>First time? How to set up your account</summary>
      <div class="help-steps">
        <ol>
          <li>An admin creates your owner account via the <a href="/gui/admin/dashboard" class="link-green">Admin Dashboard</a> or <code>npx openleash wizard</code></li>
          <li>The admin generates a setup invite for you</li>
          <li>Open the setup link to choose your passphrase</li>
          <li>Log in above with your Owner Principal ID and passphrase</li>
        </ol>
      </div>
    </details>
    <div class="admin-link">
      <a href="/gui/admin/dashboard">Admin Dashboard</a>
    </div>`}
  </div>
</body>
</html>`;
}
