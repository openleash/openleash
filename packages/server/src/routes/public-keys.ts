import type { FastifyInstance } from 'fastify';
import type { DataStore } from '@openleash/core';

export function registerPublicKeysRoutes(app: FastifyInstance, store: DataStore) {
  app.get('/v1/public-keys', async () => {
    const state = store.state.getState();
    const keys = state.server_keys.keys.map((entry) => {
      const key = store.keys.read(entry.kid);
      return {
        kid: key.kid,
        kty: 'OKP',
        alg: 'EdDSA',
        public_key_b64: key.public_key_b64,
        created_at: key.created_at,
        revoked_at: key.revoked_at,
      };
    });
    return { keys };
  });
}
