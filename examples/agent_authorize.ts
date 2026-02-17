/**
 * Example: Agent authorization using openleash SDK
 *
 * This demonstrates how an agent uses the SDK to:
 * 1. Register with openleash
 * 2. Authorize an action
 * 3. Get a proof token
 */
import * as crypto from 'node:crypto';
import {
  generateEd25519Keypair,
  registrationChallenge,
  registerAgent,
  authorize,
} from '@openleash/sdk-ts';

const OPENLEASH_URL = process.env.OPENLEASH_URL || 'http://127.0.0.1:8787';

async function main() {
  // Step 1: Generate agent keypair
  const keypair = generateEd25519Keypair();
  console.log('Generated agent keypair');
  console.log('Public key:', keypair.publicKeyB64);

  // Step 2: Get registration challenge
  const ownerPrincipalId = process.env.OWNER_PRINCIPAL_ID!;
  const agentId = 'example-agent';

  const challenge = await registrationChallenge({
    openleashUrl: OPENLEASH_URL,
    agentId,
    agentPubKeyB64: keypair.publicKeyB64,
    ownerPrincipalId,
  });
  console.log('Got challenge:', challenge.challenge_id);

  // Step 3: Sign challenge and register
  const challengeBytes = Buffer.from(challenge.challenge_b64, 'base64');
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(keypair.privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = crypto.sign(null, challengeBytes, privateKey);

  const registration = await registerAgent({
    openleashUrl: OPENLEASH_URL,
    challengeId: challenge.challenge_id,
    agentId,
    agentPubKeyB64: keypair.publicKeyB64,
    signatureB64: signature.toString('base64'),
    ownerPrincipalId,
  });
  console.log('Agent registered:', registration.agent_principal_id);

  // Step 4: Authorize an action
  const result = await authorize({
    openleashUrl: OPENLEASH_URL,
    agentId,
    privateKeyB64: keypair.privateKeyB64,
    action: {
      action_id: crypto.randomUUID(),
      action_type: 'purchase',
      requested_at: new Date().toISOString(),
      principal: { agent_id: agentId },
      subject: { principal_id: ownerPrincipalId },
      relying_party: { domain: 'example.com', trust_profile: 'LOW' },
      payload: {
        amount_minor: 5000,
        currency: 'USD',
        merchant_domain: 'example.com',
      },
    },
  });

  console.log('Authorization result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
