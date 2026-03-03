import { renderPage } from '../layout.js';

export function renderApiReference(): string {
  const content = `
    <style>
      .api-ref-main .main { padding: 0 !important; }
    </style>
    <div style="margin:-32px -40px;height:calc(100vh);display:flex;flex-direction:column">
      <div style="padding:20px 24px 0">
        <div class="page-header" style="margin-bottom:16px">
          <h2>API Reference</h2>
          <p>Interactive documentation for all OpenLeash API endpoints, powered by Scalar</p>
        </div>
      </div>
      <div style="flex:1;min-height:0">
        <iframe
          src="/reference"
          style="width:100%;height:100%;border:none;display:block"
          title="OpenLeash API Reference"
        ></iframe>
      </div>
    </div>
  `;

  return renderPage('API Reference', content, '/gui/api-reference');
}

export function renderApiReferenceUnavailable(): string {
  const content = `
    <div class="page-header">
      <h2>API Reference</h2>
      <p>Interactive API documentation</p>
    </div>

    <div class="card" style="text-align:center;padding:48px 24px">
      <div style="font-size:48px;margin-bottom:16px;opacity:0.3">&#128203;</div>
      <div style="font-weight:600;color:var(--text-primary);font-size:15px;margin-bottom:8px">API Reference Not Available</div>
      <p style="color:var(--text-secondary);font-size:13px;max-width:460px;margin:0 auto;line-height:1.7">
        The OpenAPI specification file was not found. To enable the API reference, ensure
        <span class="mono" style="font-size:12px">openapi/openapi.yaml</span> exists in your project root.
      </p>
      <div style="margin-top:24px">
        <a href="https://github.com/openleash/openleash" target="_blank" rel="noopener" class="btn btn-primary">
          View on GitHub
        </a>
      </div>
    </div>
  `;

  return renderPage('API Reference', content, '/gui/api-reference');
}
