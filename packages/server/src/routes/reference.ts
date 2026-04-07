import type { FastifyInstance } from 'fastify';

const CUSTOM_CSS = `
.dark-mode {
  --scalar-color-1: #e8f0f8;
  --scalar-color-2: #8899aa;
  --scalar-color-3: #556677;
  --scalar-color-accent: #34d399;
  --scalar-background-1: #111d28;
  --scalar-background-2: #0a1118;
  --scalar-background-3: #050a0e;
  --scalar-background-accent: rgba(52, 211, 153, 0.08);
  --scalar-border-color: rgba(136, 153, 170, 0.15);
  --scalar-sidebar-background-1: #0a1118;
  --scalar-sidebar-border-color: rgba(136, 153, 170, 0.15);
  --scalar-sidebar-color-1: #e8f0f8;
  --scalar-sidebar-color-2: #8899aa;
  --scalar-sidebar-color-active: #34d399;
  --scalar-sidebar-item-hover-background: rgba(52, 211, 153, 0.05);
  --scalar-sidebar-item-hover-color: #e8f0f8;
  --scalar-sidebar-item-active-background: rgba(52, 211, 153, 0.08);
  --scalar-sidebar-search-background: #050a0e;
  --scalar-sidebar-search-border-color: rgba(136, 153, 170, 0.15);
  --scalar-sidebar-search-color: #e8f0f8;
}
.light-mode {
  --scalar-color-1: #1a2a3a;
  --scalar-color-2: #4a5a6a;
  --scalar-color-3: #8899aa;
  --scalar-color-accent: #0d9463;
  --scalar-background-1: #ffffff;
  --scalar-background-2: #f5f7f9;
  --scalar-background-3: #ebeef2;
  --scalar-background-accent: rgba(13, 148, 99, 0.08);
  --scalar-border-color: rgba(26, 42, 58, 0.12);
  --scalar-sidebar-background-1: #f5f7f9;
  --scalar-sidebar-border-color: rgba(26, 42, 58, 0.12);
  --scalar-sidebar-color-1: #1a2a3a;
  --scalar-sidebar-color-2: #4a5a6a;
  --scalar-sidebar-color-active: #0d9463;
  --scalar-sidebar-item-hover-background: rgba(13, 148, 99, 0.05);
  --scalar-sidebar-item-hover-color: #1a2a3a;
  --scalar-sidebar-item-active-background: rgba(13, 148, 99, 0.08);
  --scalar-sidebar-search-background: #ebeef2;
  --scalar-sidebar-search-border-color: rgba(26, 42, 58, 0.12);
  --scalar-sidebar-search-color: #1a2a3a;
}
`;

export function registerReferenceRoutes(
  app: FastifyInstance,
  spec: Record<string, unknown>,
  baseUrl?: string,
) {
  // Override servers in the spec if a base URL is provided
  if (baseUrl) {
    spec = { ...spec, servers: [{ url: baseUrl, description: 'Server' }] };
  }
  // Interactive API reference (Scalar UI)
  // Scalar also serves /reference/openapi.json and /reference/openapi.yaml automatically
  app.register(
    async (instance) => {
      const { default: scalarPlugin } = await import(
        '@scalar/fastify-api-reference'
      );
      await instance.register(scalarPlugin, {
        routePrefix: '/reference',
        configuration: {
          content: spec,
          customCss: CUSTOM_CSS,
          darkMode: true,
          hideDarkModeToggle: true,
        },
      });
    },
  );
}
