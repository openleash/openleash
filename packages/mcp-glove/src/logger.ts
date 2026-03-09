/**
 * Minimal structured logger that writes JSONL to stderr.
 * stdout is reserved for the MCP JSON-RPC protocol stream.
 */
export function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  fields?: Record<string, unknown>,
): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}
