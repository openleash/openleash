// ─── Identity validation algorithms ─────────────────────────────────
// All checksum and format validation for EU personal IDs, company IDs,
// VAT numbers, LEI, DUNS, and EORI. No external dependencies.

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ok: ValidationResult = { valid: true };
const fail = (error: string): ValidationResult => ({ valid: false, error });

// ─── Shared algorithms ─────────────────────────────────────────────

/** Luhn algorithm (ISO/IEC 7812). Returns true if check digit is valid. */
export function luhn(digits: string): boolean {
  const nums = digits.split('').map(Number);
  if (nums.some(isNaN)) return false;
  let sum = 0;
  let alt = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = nums[i];
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** ISO 7064 Mod 11,10 check digit algorithm. */
export function iso7064Mod11_10(digits: string): boolean {
  const nums = digits.split('').map(Number);
  if (nums.some(isNaN) || nums.length < 2) return false;
  let remainder = 10;
  for (let i = 0; i < nums.length - 1; i++) {
    let sum = (nums[i] + remainder) % 10;
    if (sum === 0) sum = 10;
    remainder = (sum * 2) % 11;
  }
  const checkDigit = (11 - remainder) % 10;
  return checkDigit === nums[nums.length - 1];
}

/** Mod 97 on a numeric string. Returns the remainder. */
export function mod97(numStr: string): number {
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i], 10)) % 97;
  }
  return remainder;
}

/** Mod 97-10 (ISO 7064) for alphanumeric strings (used by LEI, IBAN). */
export function mod97_10(alphanumeric: string): boolean {
  // Convert letters to numbers: A=10, B=11, ..., Z=35
  let numStr = '';
  for (const ch of alphanumeric.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      numStr += ch;
    } else if (code >= 65 && code <= 90) {
      numStr += (code - 55).toString();
    } else {
      return false;
    }
  }
  return mod97(numStr) === 1;
}

function makeRegexValidator(pattern: RegExp, description: string): (value: string) => ValidationResult {
  return (value: string) => pattern.test(value) ? ok : fail(`Invalid format: expected ${description}`);
}

// ─── Personal ID validators ────────────────────────────────────────

/** Sweden: Personnummer (YYMMDD-XXXX or YYYYMMDD-XXXX) */
function validateSE_PERSONNUMMER(value: string): ValidationResult {
  // Normalize: remove hyphens and accept both 10 and 12 digit formats
  const cleaned = value.replace(/[-+]/g, '');
  let digits10: string;
  if (cleaned.length === 12) {
    digits10 = cleaned.slice(2);
  } else if (cleaned.length === 10) {
    digits10 = cleaned;
  } else {
    return fail('Personnummer must be 10 or 12 digits (YYMMDD-XXXX or YYYYMMDD-XXXX)');
  }
  if (!/^\d{10}$/.test(digits10)) {
    return fail('Personnummer must contain only digits (and optional hyphen)');
  }
  if (!luhn(digits10)) {
    return fail('Invalid Luhn check digit');
  }
  return ok;
}

/** Netherlands: BSN (Burgerservicenummer) — 9 digits, 11-test */
function validateNL_BSN(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) {
    return fail('BSN must be exactly 9 digits');
  }
  const d = cleaned.split('').map(Number);
  // 11-test: 9*d[0] + 8*d[1] + ... + 2*d[7] - 1*d[8] must be divisible by 11
  const sum = 9 * d[0] + 8 * d[1] + 7 * d[2] + 6 * d[3] + 5 * d[4] + 4 * d[5] + 3 * d[6] + 2 * d[7] - 1 * d[8];
  if (sum % 11 !== 0 || sum === 0) {
    return fail('Invalid BSN check (11-test failed)');
  }
  return ok;
}

/** Belgium: Rijksregisternummer — 11 digits, mod 97 check */
function validateBE_RRN(value: string): ValidationResult {
  const cleaned = value.replace(/[.\-\s]/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('Rijksregisternummer must be exactly 11 digits');
  }
  const first9 = parseInt(cleaned.slice(0, 9), 10);
  const checkDigits = parseInt(cleaned.slice(9, 11), 10);
  // For people born before 2000
  if (97 - (first9 % 97) === checkDigits) return ok;
  // For people born in 2000 or later, prefix with '2'
  const first9With2 = parseInt('2' + cleaned.slice(0, 9), 10);
  if (97 - (first9With2 % 97) === checkDigits) return ok;
  return fail('Invalid Rijksregisternummer check digits (mod 97)');
}

/** Poland: PESEL — 11 digits, weighted checksum */
function validatePL_PESEL(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('PESEL must be exactly 11 digits');
  }
  const d = cleaned.split('').map(Number);
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += d[i] * weights[i];
  }
  const check = (10 - (sum % 10)) % 10;
  if (check !== d[10]) {
    return fail('Invalid PESEL check digit');
  }
  return ok;
}

/** Finland: Henkilötunnus — DDMMYY{-+A}NNNC */
function validateFI_HETU(value: string): ValidationResult {
  const match = value.match(/^(\d{6})([+\-ABCDEFYXWVU])(\d{3})([0-9A-Z])$/i);
  if (!match) {
    return fail('Henkilötunnus must match DDMMYY{separator}NNNC format');
  }
  const datePart = match[1];
  const individualNumber = match[3];
  const checkChar = match[4].toUpperCase();
  const remainder = parseInt(datePart + individualNumber, 10) % 31;
  const checkChars = '0123456789ABCDEFHJKLMNPRSTUVWXY';
  if (checkChars[remainder] !== checkChar) {
    return fail('Invalid Henkilötunnus check character');
  }
  return ok;
}

/** Spain: DNI — 8 digits + letter */
function validateES_DNI(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase();
  const match = cleaned.match(/^(\d{8})([A-Z])$/);
  if (!match) {
    return fail('DNI must be 8 digits followed by a letter');
  }
  const num = parseInt(match[1], 10);
  const letter = match[2];
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (letters[num % 23] !== letter) {
    return fail('Invalid DNI check letter');
  }
  return ok;
}

/** Spain: NIE — X/Y/Z + 7 digits + letter */
function validateES_NIE(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase();
  const match = cleaned.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!match) {
    return fail('NIE must be X/Y/Z followed by 7 digits and a letter');
  }
  const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' };
  const num = parseInt(prefixMap[match[1]] + match[2], 10);
  const letter = match[3];
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (letters[num % 23] !== letter) {
    return fail('Invalid NIE check letter');
  }
  return ok;
}

/** Italy: Codice Fiscale — 16 alphanumeric chars */
function validateIT_CF(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(cleaned)) {
    return fail('Codice Fiscale must be exactly 16 alphanumeric characters');
  }
  const oddValues: Record<string, number> = {
    '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
    'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
    'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
    'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23,
  };
  const evenValues: Record<string, number> = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
    'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
    'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25,
  };
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = cleaned[i];
    // Positions are 1-indexed: odd positions (1,3,5,...) use odd table
    if ((i + 1) % 2 === 1) {
      sum += oddValues[ch] ?? 0;
    } else {
      sum += evenValues[ch] ?? 0;
    }
  }
  const expectedCheck = String.fromCharCode(65 + (sum % 26));
  if (cleaned[15] !== expectedCheck) {
    return fail('Invalid Codice Fiscale check character');
  }
  return ok;
}

/** Germany: Steuerliche Identifikationsnummer — 11 digits, ISO 7064 Mod 11,10 */
function validateDE_STEUERID(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('Steuer-ID must be exactly 11 digits');
  }
  // First digit must not be 0
  if (cleaned[0] === '0') {
    return fail('Steuer-ID must not start with 0');
  }
  if (!iso7064Mod11_10(cleaned)) {
    return fail('Invalid Steuer-ID check digit');
  }
  return ok;
}

/** France: NIR (Numéro de sécurité sociale) — 13 digits + 2-digit key */
function validateFR_NIR(value: string): ValidationResult {
  // Accept with or without spaces/dashes, and with the 2-digit key
  let cleaned = value.replace(/[\s.-]/g, '');
  // Handle Corsica: 2A → 19, 2B → 18
  cleaned = cleaned.replace(/^(\d)2A/i, '$119').replace(/^(\d)2B/i, '$118');
  if (!/^\d{15}$/.test(cleaned)) {
    return fail('NIR must be 13 digits + 2-digit key (15 total)');
  }
  const mainPart = cleaned.slice(0, 13);
  const key = parseInt(cleaned.slice(13, 15), 10);
  // Use BigInt for precision with 13-digit numbers
  const mainNum = BigInt(mainPart);
  const expectedKey = 97 - Number(mainNum % 97n);
  if (key !== expectedKey) {
    return fail('Invalid NIR key digits');
  }
  return ok;
}

/** Croatia: OIB — 11 digits, ISO 7064 Mod 11,10 */
function validateHR_OIB(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('OIB must be exactly 11 digits');
  }
  if (!iso7064Mod11_10(cleaned)) {
    return fail('Invalid OIB check digit');
  }
  return ok;
}

/** Bulgaria: EGN — 10 digits, weighted checksum */
function validateBG_EGN(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{10}$/.test(cleaned)) {
    return fail('EGN must be exactly 10 digits');
  }
  const d = cleaned.split('').map(Number);
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += d[i] * weights[i];
  }
  const check = sum % 11;
  const expected = check === 10 ? 0 : check;
  if (expected !== d[9]) {
    return fail('Invalid EGN check digit');
  }
  return ok;
}

/** Czech Republic: Rodné číslo — 9 or 10 digits */
function validateCZ_RC(value: string): ValidationResult {
  const cleaned = value.replace(/[/\s]/g, '');
  if (!/^\d{9,10}$/.test(cleaned)) {
    return fail('Rodné číslo must be 9 or 10 digits');
  }
  if (cleaned.length === 10) {
    const num = parseInt(cleaned, 10);
    if (num % 11 !== 0) {
      return fail('Invalid Rodné číslo (10-digit must be divisible by 11)');
    }
  }
  return ok;
}

/** Denmark: CPR-nummer — 10 digits (DDMMYY-XXXX) */
function validateDK_CPR(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(cleaned)) {
    return fail('CPR must be exactly 10 digits');
  }
  // Mod-11 check was removed by Danish authorities in 2007, so we only validate format
  return ok;
}

/** Estonia: Isikukood — 11 digits */
function validateEE_IK(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('Isikukood must be exactly 11 digits');
  }
  const d = cleaned.split('').map(Number);
  const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += d[i] * weights1[i];
  let check = sum % 11;
  if (check === 10) {
    const weights2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];
    sum = 0;
    for (let i = 0; i < 10; i++) sum += d[i] * weights2[i];
    check = sum % 11;
    if (check === 10) check = 0;
  }
  if (check !== d[10]) {
    return fail('Invalid Isikukood check digit');
  }
  return ok;
}

/** Greece: AMKA — 11 digits, Luhn */
function validateGR_AMKA(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('AMKA must be exactly 11 digits');
  }
  if (!luhn(cleaned)) {
    return fail('Invalid AMKA check digit (Luhn)');
  }
  return ok;
}

/** Ireland: PPS Number — 7 digits + 1-2 letters */
function validateIE_PPSN(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  if (!/^\d{7}[A-Z]{1,2}$/.test(cleaned)) {
    return fail('PPS Number must be 7 digits followed by 1-2 letters');
  }
  const d = cleaned.slice(0, 7).split('').map(Number);
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += d[i] * weights[i];
  // If there's a second letter (new format), add its value * 9
  if (cleaned.length === 9) {
    sum += (cleaned.charCodeAt(8) - 64) * 9;
  }
  const check = sum % 23;
  const expected = check === 0 ? 'W' : String.fromCharCode(64 + check);
  if (cleaned[7] !== expected) {
    return fail('Invalid PPS Number check character');
  }
  return ok;
}

/** Lithuania: Asmens kodas — 11 digits */
function validateLT_AK(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return fail('Asmens kodas must be exactly 11 digits');
  }
  // Same algorithm as Estonia
  const d = cleaned.split('').map(Number);
  const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += d[i] * weights1[i];
  let check = sum % 11;
  if (check === 10) {
    const weights2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];
    sum = 0;
    for (let i = 0; i < 10; i++) sum += d[i] * weights2[i];
    check = sum % 11;
    if (check === 10) check = 0;
  }
  if (check !== d[10]) {
    return fail('Invalid Asmens kodas check digit');
  }
  return ok;
}

/** Portugal: NIF — 9 digits, mod 11 */
function validatePT_NIF(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(cleaned)) {
    return fail('NIF must be exactly 9 digits');
  }
  const d = cleaned.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += d[i] * (9 - i);
  }
  const remainder = sum % 11;
  const check = remainder < 2 ? 0 : 11 - remainder;
  if (check !== d[8]) {
    return fail('Invalid NIF check digit');
  }
  return ok;
}

/** Romania: CNP — 13 digits, weighted checksum */
function validateRO_CNP(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{13}$/.test(cleaned)) {
    return fail('CNP must be exactly 13 digits');
  }
  const d = cleaned.split('').map(Number);
  const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += d[i] * weights[i];
  }
  const remainder = sum % 11;
  const check = remainder === 10 ? 1 : remainder;
  if (check !== d[12]) {
    return fail('Invalid CNP check digit');
  }
  return ok;
}

/** Slovakia: Rodné číslo — same rules as Czech Republic */
function validateSK_RC(value: string): ValidationResult {
  return validateCZ_RC(value);
}

/** Slovenia: EMŠO — 13 digits, mod 11 weighted checksum */
function validateSI_EMSO(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{13}$/.test(cleaned)) {
    return fail('EMŠO must be exactly 13 digits');
  }
  const d = cleaned.split('').map(Number);
  const weights = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += d[i] * weights[i];
  }
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  // Check digit of 10 is invalid
  if (check === 10) return fail('Invalid EMŠO (check digit would be 10)');
  if (check !== d[12]) {
    return fail('Invalid EMŠO check digit');
  }
  return ok;
}

// ─── Personal ID validator registry ─────────────────────────────────

export const EU_PERSONAL_ID_VALIDATORS: Record<string, (value: string) => ValidationResult> = {
  'SE:PERSONNUMMER': validateSE_PERSONNUMMER,
  'NL:BSN': validateNL_BSN,
  'BE:RIJKSREGISTERNUMMER': validateBE_RRN,
  'PL:PESEL': validatePL_PESEL,
  'FI:HENKILOTUNNUS': validateFI_HETU,
  'ES:DNI': validateES_DNI,
  'ES:NIE': validateES_NIE,
  'IT:CODICE_FISCALE': validateIT_CF,
  'DE:STEUER_ID': validateDE_STEUERID,
  'FR:NIR': validateFR_NIR,
  'HR:OIB': validateHR_OIB,
  'BG:EGN': validateBG_EGN,
  'CZ:RODNE_CISLO': validateCZ_RC,
  'DK:CPR': validateDK_CPR,
  'EE:ISIKUKOOD': validateEE_IK,
  'GR:AMKA': validateGR_AMKA,
  'IE:PPSN': validateIE_PPSN,
  'LT:ASMENS_KODAS': validateLT_AK,
  'PT:NIF': validatePT_NIF,
  'RO:CNP': validateRO_CNP,
  'SK:RODNE_CISLO': validateSK_RC,
  'SI:EMSO': validateSI_EMSO,
  // Regex-only validation for countries without well-known checksum algorithms
  'AT:ZMR': makeRegexValidator(/^\d{12}$/, '12 digits'),
  'CY:ARC': makeRegexValidator(/^\d{1,10}$/, '1-10 digits'),
  'HU:SZEMELYI_SZAM': makeRegexValidator(/^\d{6}[A-Z]{2}$/i, '6 digits + 2 letters'),
  'HU:ADOAZONOSITO': (value: string) => {
    const cleaned = value.replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(cleaned)) return fail('Adóazonosító must be 10 digits');
    return ok;
  },
  'LV:PERSONAS_KODS': makeRegexValidator(/^\d{6}-?\d{5}$/, 'DDMMYY-NNNNN'),
  'LU:MATRICULE': makeRegexValidator(/^\d{13}$/, '13 digits'),
  'MT:ID_CARD': makeRegexValidator(/^\d{1,7}[A-Z]$/i, '1-7 digits + letter'),
};

/** List of known personal ID types per country. */
export const EU_PERSONAL_ID_TYPES: Record<string, string[]> = {
  AT: ['ZMR'],
  BE: ['RIJKSREGISTERNUMMER'],
  BG: ['EGN'],
  HR: ['OIB'],
  CY: ['ARC'],
  CZ: ['RODNE_CISLO'],
  DK: ['CPR'],
  EE: ['ISIKUKOOD'],
  FI: ['HENKILOTUNNUS'],
  FR: ['NIR'],
  DE: ['STEUER_ID'],
  GR: ['AMKA'],
  HU: ['SZEMELYI_SZAM', 'ADOAZONOSITO'],
  IE: ['PPSN'],
  IT: ['CODICE_FISCALE'],
  LV: ['PERSONAS_KODS'],
  LT: ['ASMENS_KODAS'],
  LU: ['MATRICULE'],
  MT: ['ID_CARD'],
  NL: ['BSN'],
  PL: ['PESEL'],
  PT: ['NIF'],
  RO: ['CNP'],
  SK: ['RODNE_CISLO'],
  SI: ['EMSO'],
  ES: ['DNI', 'NIE'],
  SE: ['PERSONNUMMER'],
};

// ─── Company ID validators ──────────────────────────────────────────

/** VAT number format patterns per EU country */
const VAT_PATTERNS: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE[01]\d{9}$/,
  BG: /^BG\d{9,10}$/,
  HR: /^HR\d{11}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[0-9A-Z]{2}\d{9}$/,
  DE: /^DE\d{9}$/,
  GR: /^EL\d{9}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d{7}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LV: /^LV\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SK: /^SK\d{10}$/,
  SI: /^SI\d{8}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  SE: /^SE\d{12}$/,
};

/** Validate a VAT number. Value should include the country prefix (e.g. "SE556123456701"). */
export function validateVAT(value: string): ValidationResult {
  const cleaned = value.replace(/[\s.-]/g, '').toUpperCase();
  if (cleaned.length < 4) {
    return fail('VAT number must include country prefix (e.g. SE, DE, FR)');
  }
  // Extract country code (first 2 chars, except Greece uses EL)
  const prefix = cleaned.slice(0, 2);
  const countryCode = prefix === 'EL' ? 'GR' : prefix;
  const pattern = VAT_PATTERNS[countryCode];
  if (!pattern) {
    return fail(`Unknown VAT country prefix: ${prefix}`);
  }
  if (!pattern.test(cleaned)) {
    return fail(`Invalid VAT format for country ${prefix}`);
  }
  return ok;
}

/** Company registration number patterns per EU country */
const COMPANY_REG_PATTERNS: Record<string, RegExp> = {
  AT: /^FN\s?\d{5,6}[a-z]$/i,          // Firmenbuchnummer
  BE: /^0?\d{9,10}$/,                    // KBO/BCE number
  BG: /^\d{9,13}$/,                      // EIK/BULSTAT
  HR: /^\d{11}$/,                         // OIB (same as personal)
  CY: /^HE\d{5,6}$/i,                   // Registration number
  CZ: /^\d{8}$/,                          // IČO
  DK: /^\d{8}$/,                          // CVR
  EE: /^\d{8}$/,                          // Registry code
  FI: /^\d{7}-?\d$/,                      // Y-tunnus
  FR: /^\d{9}$/,                          // SIREN
  DE: /^HR[AB]\s?\d{4,6}$/i,            // Handelsregisternummer
  GR: /^\d{12}$/,                         // GEMI
  HU: /^\d{2}-\d{2}-\d{6}$/,            // Cégjegyzékszám
  IE: /^\d{5,6}$/,                        // CRO number
  IT: /^\d{11}$/,                         // Partita IVA / REA
  LV: /^\d{11}$/,                         // Registration number
  LT: /^\d{7,9}$/,                       // JAR code
  LU: /^[A-Z]\d{5,6}$/i,               // RCS number
  MT: /^C\s?\d{4,5}$/i,                 // Company number
  NL: /^\d{8}$/,                          // KVK number
  PL: /^\d{9,10}$/,                       // KRS or NIP
  PT: /^\d{9}$/,                          // NIPC
  RO: /^J\d{2}\/\d{1,6}\/\d{4}$/,     // Registrul Comerțului
  SK: /^\d{8}$/,                          // IČO
  SI: /^\d{7,10}$/,                       // Matična številka
  ES: /^[A-Z]\d{7}[A-Z0-9]$/i,         // CIF
  SE: /^\d{10}$/,                         // Organisationsnummer
};

/** Validate a company registration number for a given country. */
export function validateCompanyReg(value: string, country: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '');
  const pattern = COMPANY_REG_PATTERNS[country];
  if (!pattern) {
    return fail(`No company registration format known for country ${country}`);
  }
  if (!pattern.test(cleaned)) {
    return fail(`Invalid company registration format for ${country}`);
  }
  // Additional checksum for Swedish organisationsnummer (Luhn on digit 1-9, similar to personnummer)
  if (country === 'SE' && /^\d{10}$/.test(cleaned)) {
    if (!luhn(cleaned)) {
      return fail('Invalid Swedish organisationsnummer (Luhn check failed)');
    }
  }
  return ok;
}

/** Validate a Legal Entity Identifier (ISO 17442). 20 alphanumeric chars, mod 97-10. */
export function validateLEI(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]{20}$/.test(cleaned)) {
    return fail('LEI must be exactly 20 alphanumeric characters');
  }
  if (!mod97_10(cleaned)) {
    return fail('Invalid LEI check digits (mod 97-10)');
  }
  return ok;
}

/** Validate a DUNS number. 9 digits. */
export function validateDUNS(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(cleaned)) {
    return fail('DUNS number must be exactly 9 digits');
  }
  return ok;
}

/** Validate an EORI number. Country prefix + up to 15 alphanumeric chars. */
export function validateEORI(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{1,15}$/.test(cleaned)) {
    return fail('EORI must be a 2-letter country prefix followed by 1-15 alphanumeric characters');
  }
  return ok;
}

/** Validate a Global Location Number (GLN). 13 digits with check digit. */
export function validateGLN(value: string): ValidationResult {
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(cleaned)) {
    return fail('GLN must be exactly 13 digits');
  }
  // GS1 check digit (mod 10, alternating weights 1 and 3)
  const digits = cleaned.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  if (digits[12] !== checkDigit) {
    return fail('Invalid GLN check digit');
  }
  return ok;
}

/** Validate an ISIN (International Securities Identification Number). 12 chars, Luhn on numeric conversion. */
export function validateISIN(value: string): ValidationResult {
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(cleaned)) {
    return fail('ISIN must be 2-letter country code + 9 alphanumeric chars + 1 check digit');
  }
  // Convert letters to numbers (A=10..Z=35) then Luhn
  const numericStr = cleaned.split('').map((c) => {
    const code = c.charCodeAt(0);
    return code >= 65 ? String(code - 55) : c;
  }).join('');
  if (!luhn(numericStr)) {
    return fail('Invalid ISIN check digit (Luhn)');
  }
  return ok;
}

/** Validate a tax identification number. Accepts alphanumeric, 4-20 chars. */
export function validateTaxId(value: string): ValidationResult {
  const cleaned = value.replace(/[\s.-]/g, '');
  if (!/^[A-Z0-9]{4,20}$/i.test(cleaned)) {
    return fail('Tax ID must be 4-20 alphanumeric characters');
  }
  return ok;
}

/** Validate a Chamber of Commerce registration number. Alphanumeric, 3-20 chars. */
export function validateChamberOfCommerce(value: string): ValidationResult {
  const cleaned = value.replace(/[\s.-]/g, '');
  if (!/^[A-Z0-9]{3,20}$/i.test(cleaned)) {
    return fail('Chamber of Commerce number must be 3-20 alphanumeric characters');
  }
  return ok;
}

/** Validate a NAICS code. 2-6 digits. */
export function validateNAICS(value: string): ValidationResult {
  const cleaned = value.replace(/[\s.-]/g, '');
  if (!/^\d{2,6}$/.test(cleaned)) {
    return fail('NAICS code must be 2-6 digits');
  }
  return ok;
}

/** Validate a SIC code. 4 digits. */
export function validateSIC(value: string): ValidationResult {
  const cleaned = value.replace(/[\s.-]/g, '');
  if (!/^\d{4}$/.test(cleaned)) {
    return fail('SIC code must be exactly 4 digits');
  }
  return ok;
}
