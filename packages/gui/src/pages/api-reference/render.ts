import { renderPage } from '../../shared/layout.js';
import { assetTags } from '../../shared/manifest.js';

export function renderApiReference(): string {
  const content = `
    <style>
      .api-ref-main .main { padding: 0 !important; }
    </style>
    <div class="api-ref-fullbleed">
      <div class="api-ref-header-wrap">
        <div class="page-header">
          <h2>API Reference</h2>
          <p>Interactive documentation for all OpenLeash API endpoints, powered by Scalar</p>
        </div>
      </div>
      <div class="api-ref-iframe-wrap">
        <iframe
          id="scalar-frame"
          src="/reference"
          class="api-ref-iframe"
          title="OpenLeash API Reference"
        ></iframe>
      </div>
    </div>
    ${assetTags("pages/api-reference/client.ts")}
  `;

  return renderPage('API Reference', content, '/gui/admin/api-reference');
}

export function renderApiReferenceUnavailable(): string {
  const content = `
    <div class="page-header">
      <h2>API Reference</h2>
      <p>Interactive API documentation</p>
    </div>

    <div class="card empty-state">
      <div class="material-symbols-outlined">api</div>
      <div class="empty-state-title">API Reference Not Available</div>
      <p class="empty-state-text api-ref-unavailable-text">
        The OpenAPI specification file was not found. To enable the API reference, ensure
        <span class="mono api-ref-unavailable-mono">openapi/openapi.yaml</span> exists in your project root.
      </p>
      <div class="api-ref-unavailable-actions">
        <a href="https://github.com/openleash/openleash" target="_blank" rel="noopener" class="btn btn-primary">
          View on GitHub
        </a>
      </div>
    </div>
  `;

  return renderPage('API Reference', content, '/gui/admin/api-reference');
}
