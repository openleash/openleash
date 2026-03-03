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
`;

export function registerReferenceRoutes(
  app: FastifyInstance,
  spec: Record<string, unknown>
) {
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
