#!/usr/bin/env node

import { startCommand } from './commands/start.js';
import { wizardCommand } from './commands/wizard.js';
import { policyListCommand, policyShowCommand, policyUpsertCommand, policyValidateCommand } from './commands/policy.js';
import { playgroundListCommand, playgroundRunCommand } from './commands/playground.js';
import { keysListCommand, keysRotateCommand } from './commands/keys.js';
import { testvectorsCommand } from './commands/testvectors.js';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

async function main() {
  try {
    switch (command) {
      case 'start':
        await startCommand();
        break;
      case 'wizard':
        await wizardCommand();
        break;
      case 'policy':
        switch (subcommand) {
          case 'list':
            await policyListCommand();
            break;
          case 'show':
            await policyShowCommand(args[2]);
            break;
          case 'upsert':
            await policyUpsertCommand(args.slice(2));
            break;
          case 'validate':
            await policyValidateCommand(args.slice(2));
            break;
          default:
            console.log('Usage: openleash policy <list|show|upsert|validate>');
        }
        break;
      case 'playground':
        switch (subcommand) {
          case 'list':
            await playgroundListCommand();
            break;
          case 'run':
            await playgroundRunCommand(args[2], args.slice(3));
            break;
          default:
            console.log('Usage: openleash playground <list|run>');
        }
        break;
      case 'keys':
        switch (subcommand) {
          case 'list':
            await keysListCommand();
            break;
          case 'rotate':
            await keysRotateCommand();
            break;
          default:
            console.log('Usage: openleash keys <list|rotate>');
        }
        break;
      case 'testvectors':
        await testvectorsCommand();
        break;
      default:
        printUsage();
    }
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
openleash - Local-first authorization + proof sidecar for AI agents

Commands:
  start [--gui|--no-gui]  Start the openleash server
  wizard               Interactive setup wizard
  policy list          List policies
  policy show <id>     Show policy YAML
  policy upsert        Create/update a policy
  policy validate      Validate a policy file
  playground list      List playground scenarios
  playground run <n>   Run a playground scenario
  keys list            List signing keys
  keys rotate          Rotate signing key
  testvectors          Generate test vectors
`);
}

main();
