import { describe, it, expect, vi } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpUri,
  verifyTotp,
  generateBackupCodes,
  verifyBackupCode,
} from '../src/totp.js';

describe('base32', () => {
  it('round-trips arbitrary buffers', () => {
    const inputs = [
      Buffer.from(''),
      Buffer.from('f'),
      Buffer.from('fo'),
      Buffer.from('foo'),
      Buffer.from('foob'),
      Buffer.from('fooba'),
      Buffer.from('foobar'),
    ];
    for (const buf of inputs) {
      expect(base32Decode(base32Encode(buf))).toEqual(buf);
    }
  });

  it('encodes known values (RFC 4648 test vectors)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Encode(Buffer.from('Hello'))).toBe('JBSWY3DP');
  });

  it('decodes case-insensitively', () => {
    expect(base32Decode('mzxw6ytboi')).toEqual(Buffer.from('foobar'));
  });

  it('throws on invalid characters', () => {
    expect(() => base32Decode('MZXW6YTB!!')).toThrow('Invalid base32 character');
  });
});

describe('generateTotpSecret', () => {
  it('returns a base32 string of correct length', () => {
    const secret = generateTotpSecret();
    // 20 bytes → 32 base32 chars
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(secret).length).toBe(20);
  });
});

describe('generateTotpUri', () => {
  it('builds a valid otpauth URI', () => {
    const uri = generateTotpUri('JBSWY3DPEHPK3PXP', 'user@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=OpenLeash');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('encodes custom issuer', () => {
    const uri = generateTotpUri('JBSWY3DP', 'test', 'My App');
    expect(uri).toContain('issuer=My%20App');
  });
});

describe('verifyTotp', () => {
  // Known secret: base32 of 12345678901234567890
  const SECRET = base32Encode(Buffer.from('12345678901234567890'));

  it('rejects non-6-digit codes', () => {
    expect(verifyTotp(SECRET, '12345')).toBe(false);
    expect(verifyTotp(SECRET, '1234567')).toBe(false);
    expect(verifyTotp(SECRET, 'abcdef')).toBe(false);
  });

  it('accepts a code generated for the current time', () => {
    // Generate the expected code using the same logic
    const crypto = require('node:crypto');
    const key = base32Decode(SECRET);
    const counter = BigInt(Math.floor(Date.now() / 30_000));
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(counter);
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const expected = String(code % 1_000_000).padStart(6, '0');

    expect(verifyTotp(SECRET, expected)).toBe(true);
  });

  it('accepts codes within the window', () => {
    // Freeze time to test window
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const crypto = require('node:crypto');
    const key = base32Decode(SECRET);

    // Generate code for t-1 (previous period)
    const counter = BigInt(Math.floor(now / 30_000)) - 1n;
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(counter);
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const prevCode = String(code % 1_000_000).padStart(6, '0');

    expect(verifyTotp(SECRET, prevCode, 1)).toBe(true);
    // With window=0, previous period code should fail
    expect(verifyTotp(SECRET, prevCode, 0)).toBe(false);

    vi.restoreAllMocks();
  });
});

describe('backup codes', () => {
  it('generates the requested number of codes', () => {
    const { codes, hashes } = generateBackupCodes(5);
    expect(codes).toHaveLength(5);
    expect(hashes).toHaveLength(5);
  });

  it('generates 8-char hex codes by default', () => {
    const { codes } = generateBackupCodes();
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('verifies a valid backup code and removes it', () => {
    const { codes, hashes } = generateBackupCodes(3);

    const result = verifyBackupCode(codes[1], hashes);
    expect(result.valid).toBe(true);
    expect(result.remainingHashes).toHaveLength(2);

    // Same code should not work again
    const result2 = verifyBackupCode(codes[1], result.remainingHashes);
    expect(result2.valid).toBe(false);
    expect(result2.remainingHashes).toHaveLength(2);
  });

  it('rejects invalid backup codes', () => {
    const { hashes } = generateBackupCodes(3);
    const result = verifyBackupCode('invalidcode', hashes);
    expect(result.valid).toBe(false);
    expect(result.remainingHashes).toHaveLength(3);
  });
});
