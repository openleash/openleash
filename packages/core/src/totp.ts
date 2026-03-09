import * as crypto from 'node:crypto';

// ─── Base32 (RFC 4648) ──────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

export function base32Decode(str: string): Buffer {
  const cleaned = str.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

// ─── TOTP (RFC 6238 / RFC 4226) ─────────────────────────────────────

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function generateTotpUri(secret: string, accountName: string, issuer = 'OpenLeash'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

function computeHotp(secret: Buffer, counter: bigint): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const counter = BigInt(Math.floor(Date.now() / 30_000));

  for (let i = -window; i <= window; i++) {
    if (computeHotp(key, counter + BigInt(i)) === code) return true;
  }
  return false;
}

// ─── Backup codes ────────────────────────────────────────────────────

export function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex'); // 8-char hex
    codes.push(code);
    hashes.push(crypto.createHash('sha256').update(code).digest('hex'));
  }

  return { codes, hashes };
}

export function verifyBackupCode(code: string, hashes: string[]): { valid: boolean; remainingHashes: string[] } {
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  const idx = hashes.indexOf(hash);
  if (idx === -1) return { valid: false, remainingHashes: hashes };
  const remainingHashes = [...hashes];
  remainingHashes.splice(idx, 1);
  return { valid: true, remainingHashes };
}

// ─── QR code SVG generation ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode-svg');

export function generateTotpQrSvg(uri: string): string {
  const qr = new QRCode({
    content: uri,
    padding: 4,
    width: 200,
    height: 200,
    color: '#000000',
    background: '#ffffff',
    ecl: 'M',
    join: true,
  });
  return qr.svg() as string;
}
