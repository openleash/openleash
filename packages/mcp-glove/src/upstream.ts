import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolCallResult, ToolDefinition, UpstreamBridge } from './types.js';

/**
 * Creates an UpstreamBridge that spawns and communicates with the real MCP
 * server process via stdio JSON-RPC.
 */
export async function createUpstreamBridge(params: {
  command: string;
  args: string[];
  env: Record<string, string>;
  serverName: string;
}): Promise<UpstreamBridge> {
  const transport = new StdioClientTransport({
    command: params.command,
    args: params.args,
    env: { ...process.env, ...params.env } as Record<string, string>,
    stderr: 'pipe',
  });

  const client = new Client(
    { name: `mcp-glove-upstream-${params.serverName}`, version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  return {
    async listTools(): Promise<{ tools: ToolDefinition[] }> {
      const result = await client.listTools();
      return { tools: result.tools as unknown as ToolDefinition[] };
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
      const result = await client.callTool({ name, arguments: args });
      return {
        content: result.content as unknown as ToolCallResult['content'],
        isError: result.isError as boolean | undefined,
      };
    },

    async close(): Promise<void> {
      await client.close();
    },
  };
}
