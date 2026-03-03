import { describe, it, expect } from 'vitest';
import { hashPassphrase, verifyPassphrase } from '../src/passphrase.js';

describe('passphrase hashing', () => {
  it('hash and verify roundtrip', () => {
    const { hash, salt } = hashPassphrase('my-secret-passphrase');
    expect(hash).toBeDefined();
    expect(salt).toBeDefined();
    expect(verifyPassphrase('my-secret-passphrase', hash, salt)).toBe(true);
  });

  it('rejects wrong passphrase', () => {
    const { hash, salt } = hashPassphrase('correct-passphrase');
    expect(verifyPassphrase('wrong-passphrase', hash, salt)).toBe(false);
  });

  it('uses provided salt for deterministic hashing', () => {
    const salt = 'fixed-salt-for-testing';
    const { hash: hash1 } = hashPassphrase('test', salt);
    const { hash: hash2 } = hashPassphrase('test', salt);
    expect(hash1).toBe(hash2);
  });

  it('generates different salts by default', () => {
    const result1 = hashPassphrase('same-passphrase');
    const result2 = hashPassphrase('same-passphrase');
    expect(result1.salt).not.toBe(result2.salt);
  });
});
