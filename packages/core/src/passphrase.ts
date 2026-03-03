import * as crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassphrase(
  passphrase: string,
  salt?: string
): { hash: string; salt: string } {
  const usedSalt = salt ?? crypto.randomBytes(32).toString('base64');
  const derived = crypto.scryptSync(passphrase, usedSalt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return { hash: derived.toString('base64'), salt: usedSalt };
}

export function verifyPassphrase(
  passphrase: string,
  hash: string,
  salt: string
): boolean {
  const derived = crypto.scryptSync(passphrase, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const expected = Buffer.from(hash, 'base64');
  return crypto.timingSafeEqual(derived, expected);
}
