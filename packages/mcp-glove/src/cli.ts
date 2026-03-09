#!/usr/bin/env node
/**
 * mcp-glove CLI
 *
 * Usage:
 *   mcp-glove start \
 *     --server-name office365-outlook \
 *     --upstream-cmd "npx -y @jbctechsolutions/mcp-outlook-mac" \
 *     --profile office365-outlook \
 *     --approval-timeout-ms 120000
 *
 * All flags can also be set via environment variables (env vars take priority
 * when both are present so wizard-generated configs work without extra quoting):
 *
 *   OPENLEASH_SERVER_NAME      (default: "office365-outlook")
 *   OPENLEASH_UPSTREAM_CMD     e.g. "npx -y @jbctechsolutions/mcp-outlook-mac"
 *   OPENLEASH_UPSTREAM_ENV     JSON object, extra env for upstream process
 *   OPENLEASH_GLOVE_PROFILE    (default: "office365-outlook")
 *   OPENLEASH_URL              (default: "http://127.0.0.1:8787")
 *   OPENLEASH_AGENT_ID
 *   OPENLEASH_AGENT_PRIVATE_KEY_B64
 *   OPENLEASH_SUBJECT_ID       Owner principal UUID
 *   OPENLEASH_APPROVAL_TIMEOUT_MS  (default: 120000)
 *   OPENLEASH_APPROVAL_POLL_INTERVAL_MS (default: 5000)
 */

import { createSdkAuthClient } from './auth-client.js';
import { GloveServer } from './glove.js';
import { log } from './logger.js';
import type { GloveConfig } from './types.js';
import { createUpstreamBridge } from './upstream.js';

// ─── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

function env(name: string): string | undefined {
  return process.env[name];
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    log('error', `Missing required config: ${name}`);
    process.exit(1);
  }
  return value;
}

// ─── Command: start ──────────────────────────────────────────────────────────

async function startCommand(argv: string[]): Promise<void> {
  const flags = parseArgs(argv);

  const serverName =
    env('OPENLEASH_SERVER_NAME') ?? flags['server-name'] ?? 'office365-outlook';

  const rawUpstreamCmd =
    env('OPENLEASH_UPSTREAM_CMD') ??
    flags['upstream-cmd'] ??
    requireConfig(undefined, 'OPENLEASH_UPSTREAM_CMD / --upstream-cmd');

  // Split "npx -y pkg" → { command: "npx", args: ["-y", "pkg"] }
  const [upstreamCmd, ...upstreamArgs] = rawUpstreamCmd.trim().split(/\s+/);

  const upstreamEnvRaw = env('OPENLEASH_UPSTREAM_ENV');
  const upstreamEnv: Record<string, string> = upstreamEnvRaw
    ? (JSON.parse(upstreamEnvRaw) as Record<string, string>)
    : {};

  const profile =
    env('OPENLEASH_GLOVE_PROFILE') ?? flags['profile'] ?? 'office365-outlook';

  const openleashUrl =
    env('OPENLEASH_URL') ?? flags['openleash-url'] ?? 'http://127.0.0.1:8787';

  const agentId = requireConfig(
    env('OPENLEASH_AGENT_ID') ?? flags['agent-id'],
    'OPENLEASH_AGENT_ID / --agent-id',
  );

  const privateKeyB64 = requireConfig(
    env('OPENLEASH_AGENT_PRIVATE_KEY_B64') ?? flags['private-key-b64'],
    'OPENLEASH_AGENT_PRIVATE_KEY_B64 / --private-key-b64',
  );

  const subjectId = requireConfig(
    env('OPENLEASH_SUBJECT_ID') ?? flags['subject-id'],
    'OPENLEASH_SUBJECT_ID / --subject-id',
  );

  const approvalTimeoutMs = Number(
    env('OPENLEASH_APPROVAL_TIMEOUT_MS') ?? flags['approval-timeout-ms'] ?? '120000',
  );

  const approvalPollIntervalMs = Number(
    env('OPENLEASH_APPROVAL_POLL_INTERVAL_MS') ??
      flags['approval-poll-interval-ms'] ??
      '5000',
  );

  const config: GloveConfig = {
    serverName,
    upstreamCmd,
    upstreamArgs,
    upstreamEnv,
    profile,
    openleashUrl,
    agentId,
    privateKeyB64,
    subjectId,
    approvalTimeoutMs,
    approvalPollIntervalMs,
  };

  log('info', 'mcp-glove starting', {
    server_name: serverName,
    upstream: rawUpstreamCmd,
    profile,
    openleash_url: openleashUrl,
    agent_id: agentId,
    approval_timeout_ms: approvalTimeoutMs,
  });

  let upstream;
  try {
    upstream = await createUpstreamBridge({
      command: upstreamCmd,
      args: upstreamArgs,
      env: upstreamEnv,
      serverName,
    });
  } catch (err) {
    log('error', 'Failed to connect to upstream MCP server', { error: String(err) });
    process.exit(1);
  }

  const authClient = createSdkAuthClient(config);
  const glove = new GloveServer(config, upstream, authClient);

  try {
    await glove.start();
  } catch (err) {
    log('error', 'GloveServer crashed', { error: String(err) });
    process.exit(1);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0];

if (command === 'start') {
  startCommand(argv.slice(1)).catch((err) => {
    log('error', 'Unhandled error', { error: String(err) });
    process.exit(1);
  });
} else {
  process.stderr.write(
    'Usage: mcp-glove start [options]\n' +
      '\n' +
      'Options:\n' +
      '  --server-name <name>         MCP server name (default: office365-outlook)\n' +
      '  --upstream-cmd <cmd>         Full command to spawn upstream MCP server\n' +
      '  --profile <name>             Mapping profile (default: office365-outlook)\n' +
      '  --agent-id <id>              OpenLeash agent ID\n' +
      '  --private-key-b64 <key>      Ed25519 private key (base64)\n' +
      '  --subject-id <uuid>          Owner principal UUID\n' +
      '  --approval-timeout-ms <ms>   Approval wait timeout (default: 120000)\n' +
      '\n' +
      'All options can also be set via environment variables (see source).\n',
  );
  process.exit(1);
}
