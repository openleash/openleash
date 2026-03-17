#!/usr/bin/env node

import * as path from 'node:path';
import { loadDataStore } from '@openleash/core';
import { loadConfig } from '@openleash/server';
import { startCommand } from './commands/start.js';
import { wizardCommand } from './commands/wizard.js';
import { initCommand } from './commands/init.js';
import { policyListCommand, policyShowCommand, policyUpsertCommand, policyValidateCommand, policyDeleteCommand, policyUnbindCommand } from './commands/policy.js';
import { playgroundListCommand, playgroundRunCommand } from './commands/playground.js';
import { keysListCommand, keysRotateCommand } from './commands/keys.js';
import { testvectorsCommand } from './commands/testvectors.js';
import {
  ownerListCommand,
  ownerShowCommand,
  ownerAddContactCommand,
  ownerAddGovIdCommand,
  ownerAddCompanyIdCommand,
  ownerAddSignatoryCommand,
  ownerValidateCommand,
} from './commands/owner.js';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

async function main() {
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');
  const config = loadConfig(rootDir);
  const store = await loadDataStore(config.store, dataDir);

  try {
    switch (command) {
      case 'start':
        await startCommand(store);
        break;
      case 'wizard':
        await wizardCommand(store);
        break;
      case 'init':
        await initCommand(store, args.slice(1));
        break;
      case 'policy':
        switch (subcommand) {
          case 'list':
            await policyListCommand(store);
            break;
          case 'show':
            await policyShowCommand(store, args[2]);
            break;
          case 'upsert':
            await policyUpsertCommand(store, args.slice(2));
            break;
          case 'validate':
            await policyValidateCommand(args.slice(2));
            break;
          case 'delete':
            await policyDeleteCommand(store, args.slice(2));
            break;
          case 'unbind':
            await policyUnbindCommand(store, args.slice(2));
            break;
          default:
            console.log('Usage: openleash policy <list|show|upsert|validate|delete|unbind>');
        }
        break;
      case 'playground':
        switch (subcommand) {
          case 'list':
            await playgroundListCommand();
            break;
          case 'run':
            await playgroundRunCommand(store, args[2], args.slice(3));
            break;
          default:
            console.log('Usage: openleash playground <list|run>');
        }
        break;
      case 'keys':
        switch (subcommand) {
          case 'list':
            await keysListCommand(store);
            break;
          case 'rotate':
            await keysRotateCommand(store);
            break;
          default:
            console.log('Usage: openleash keys <list|rotate>');
        }
        break;
      case 'owner':
        switch (subcommand) {
          case 'list':
            await ownerListCommand(store);
            break;
          case 'show':
            await ownerShowCommand(store, args[2]);
            break;
          case 'add-contact':
            await ownerAddContactCommand(store, args[2]);
            break;
          case 'add-gov-id':
            await ownerAddGovIdCommand(store, args[2]);
            break;
          case 'add-company-id':
            await ownerAddCompanyIdCommand(store, args[2]);
            break;
          case 'add-signatory':
            await ownerAddSignatoryCommand(store, args[2]);
            break;
          case 'validate':
            await ownerValidateCommand(store, args[2]);
            break;
          default:
            console.log('Usage: openleash owner <list|show|add-contact|add-gov-id|add-company-id|add-signatory|validate>');
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
  init                 Non-interactive setup (headless)
  owner list           List all owners
  owner show <id>      Show owner details and identities
  owner add-contact <id>     Add a contact identity
  owner add-gov-id <id>      Add a government ID (HUMAN only)
  owner add-company-id <id>  Add a company ID (ORG only)
  owner add-signatory <id>   Add a signatory (ORG only)
  owner validate <id>        Run identity validation checks
  policy list          List policies
  policy show <id>     Show policy YAML
  policy upsert        Create/update a policy
  policy validate      Validate a policy file
  policy delete        Delete a policy and its bindings
  policy unbind        Remove policy bindings
  playground list      List playground scenarios
  playground run <n>   Run a playground scenario
  keys list            List signing keys
  keys rotate          Rotate signing key
  testvectors          Generate test vectors
`);
}

main();
