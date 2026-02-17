/**
 * Example: Counterparty proof verification using openleash SDK
 *
 * This demonstrates how a counterparty (merchant, doctor, government portal)
 * verifies a proof token from an agent.
 */
import { verifyProofOnline, verifyProofOffline } from '@openleash/sdk-ts';

const OPENLEASH_URL = process.env.OPENLEASH_URL || 'http://127.0.0.1:8787';

async function main() {
  const proofToken = process.env.PROOF_TOKEN!;
  if (!proofToken) {
    console.error('Set PROOF_TOKEN environment variable');
    process.exit(1);
  }

  // Option 1: Online verification (asks openleash server)
  console.log('=== Online Verification ===');
  const onlineResult = await verifyProofOnline({
    openleashUrl: OPENLEASH_URL,
    token: proofToken,
    expectedAgentId: 'example-agent',
  });
  console.log('Valid:', onlineResult.valid);
  console.log('Claims:', JSON.stringify(onlineResult.claims, null, 2));

  // Option 2: Offline verification (using cached public keys)
  console.log('\n=== Offline Verification ===');

  // First, fetch public keys (cache these in production)
  const keysRes = await fetch(`${OPENLEASH_URL}/v1/public-keys`);
  const { keys } = await keysRes.json() as { keys: Array<{ kid: string; public_key_b64: string }> };

  const offlineResult = await verifyProofOffline({
    token: proofToken,
    publicKeys: keys,
  });
  console.log('Valid:', offlineResult.valid);
  console.log('Claims:', JSON.stringify(offlineResult.claims, null, 2));

  if (offlineResult.valid && offlineResult.claims) {
    console.log('\nVerified action:');
    console.log('  Type:', offlineResult.claims.action_type);
    console.log('  Hash:', offlineResult.claims.action_hash);
    console.log('  Agent:', offlineResult.claims.agent_id);
  }
}

main().catch(console.error);
