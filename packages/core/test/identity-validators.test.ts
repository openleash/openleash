import { describe, it, expect } from 'vitest';
import {
  luhn,
  iso7064Mod11_10,
  mod97,
  mod97_10,
  EU_PERSONAL_ID_VALIDATORS,
  EU_PERSONAL_ID_TYPES,
  validateVAT,
  validateLEI,
  validateDUNS,
  validateEORI,
  validateCompanyReg,
  COMPANY_REG_INFO,
  validateGLN,
  validateISIN,
  validateTaxId,
  validateChamberOfCommerce,
  validateNAICS,
  validateSIC,
} from '../src/identity-validators.js';

// ─── Shared algorithms ──────────────────────────────────────────────

describe('luhn', () => {
  it('accepts valid Luhn sequence', () => {
    expect(luhn('79927398713')).toBe(true);
  });
  it('rejects invalid Luhn sequence', () => {
    expect(luhn('79927398710')).toBe(false);
  });
  it('rejects non-digit input', () => {
    expect(luhn('7992739871A')).toBe(false);
  });
});

describe('iso7064Mod11_10', () => {
  it('validates Croatian OIB test value', () => {
    // Known valid OIB: 73aborjk → using numeric test
    expect(iso7064Mod11_10('94577403194')).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(iso7064Mod11_10('94577403195')).toBe(false);
  });
});

describe('mod97', () => {
  it('computes correct remainder', () => {
    expect(mod97('123456789')).toBe(123456789 % 97);
  });
});

describe('mod97_10', () => {
  it('validates correct alphanumeric check (LEI-style)', () => {
    // A valid LEI: 5493001KJTIIGC8Y1R12
    expect(mod97_10('5493001KJTIIGC8Y1R12')).toBe(true);
  });
  it('rejects invalid check', () => {
    expect(mod97_10('5493001KJTIIGC8Y1R99')).toBe(false);
  });
});

// ─── Sweden: Personnummer ───────────────────────────────────────────

describe('SE:PERSONNUMMER', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['SE:PERSONNUMMER']!;

  it('accepts valid 10-digit personnummer', () => {
    // Test number: 811228-9874 (Luhn-valid)
    expect(validate('8112289874').valid).toBe(true);
  });
  it('accepts valid personnummer with hyphen', () => {
    expect(validate('811228-9874').valid).toBe(true);
  });
  it('accepts valid 12-digit personnummer', () => {
    expect(validate('19811228-9874').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('811228-9875').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('81122898').valid).toBe(false);
  });
});

// ─── Netherlands: BSN ───────────────────────────────────────────────

describe('NL:BSN', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['NL:BSN']!;

  it('accepts valid BSN', () => {
    // 111222333: 9*1+8*1+7*1+6*2+5*2+4*2+3*3+2*3-1*3 = 9+8+7+12+10+8+9+6-3 = 66, 66%11=0
    expect(validate('111222333').valid).toBe(true);
  });
  it('rejects invalid BSN (11-test fails)', () => {
    expect(validate('123456789').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('12345678').valid).toBe(false);
  });
});

// ─── Belgium: Rijksregisternummer ───────────────────────────────────

describe('BE:RIJKSREGISTERNUMMER', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['BE:RIJKSREGISTERNUMMER']!;

  it('accepts valid RRN (pre-2000)', () => {
    // 85.07.30-033.28 → 85073003328
    // 97 - (850730033 % 97) = 97 - (850730033 % 97)
    const first9 = 850730033;
    const check = 97 - (first9 % 97);
    const rrn = `${first9}${check.toString().padStart(2, '0')}`;
    expect(validate(rrn).valid).toBe(true);
  });
  it('accepts valid RRN (post-2000)', () => {
    const first9 = 100101001;
    const first9With2 = 2100101001;
    const check = 97 - (first9With2 % 97);
    const rrn = `${first9}${check.toString().padStart(2, '0')}`;
    expect(validate(rrn).valid).toBe(true);
  });
  it('rejects invalid check digits', () => {
    expect(validate('85073003399').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('8507300332').valid).toBe(false);
  });
});

// ─── Poland: PESEL ──────────────────────────────────────────────────

describe('PL:PESEL', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['PL:PESEL']!;

  it('accepts valid PESEL', () => {
    // 44051401458: weights [1,3,7,9,1,3,7,9,1,3]
    // 4*1+4*3+0*7+5*9+1*1+4*3+0*7+1*9+4*1+5*3 = 4+12+0+45+1+12+0+9+4+15 = 102
    // check = (10 - 102%10) % 10 = (10-2)%10 = 8
    expect(validate('44051401458').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('44051401459').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('4405140145').valid).toBe(false);
  });
});

// ─── Finland: Henkilötunnus ─────────────────────────────────────────

describe('FI:HENKILOTUNNUS', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['FI:HENKILOTUNNUS']!;

  it('accepts valid henkilötunnus', () => {
    // 131052-308T: 131052308 % 31 = ?
    // 131052308 % 31 = 131052308 - 31*4227493 = 131052308 - 131052283 = 25 → checkChars[25] = 'T'
    expect(validate('131052-308T').valid).toBe(true);
  });
  it('rejects invalid check character', () => {
    expect(validate('131052-308X').valid).toBe(false);
  });
  it('rejects wrong format', () => {
    expect(validate('13105230T').valid).toBe(false);
  });
});

// ─── Spain: DNI ─────────────────────────────────────────────────────

describe('ES:DNI', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['ES:DNI']!;

  it('accepts valid DNI', () => {
    // 12345678Z: 12345678 % 23 = 14 → letters[14] = 'Z'
    expect(validate('12345678Z').valid).toBe(true);
  });
  it('rejects invalid check letter', () => {
    expect(validate('12345678A').valid).toBe(false);
  });
  it('rejects wrong format', () => {
    expect(validate('1234567Z').valid).toBe(false);
  });
});

// ─── Spain: NIE ─────────────────────────────────────────────────────

describe('ES:NIE', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['ES:NIE']!;

  it('accepts valid NIE with X prefix', () => {
    // X1234567L: 01234567 % 23 = 1234567 % 23 = 1234567 - 23*53676 = 1234567 - 1234548 = 19 → 'L'
    expect(validate('X1234567L').valid).toBe(true);
  });
  it('accepts valid NIE with Y prefix', () => {
    // Y1234567X: 11234567 % 23 = 11234567 - 23*488459 = 11234567 - 11234557 = 10 → 'X'
    expect(validate('Y1234567X').valid).toBe(true);
  });
  it('rejects invalid check letter', () => {
    expect(validate('X1234567A').valid).toBe(false);
  });
});

// ─── Italy: Codice Fiscale ──────────────────────────────────────────

describe('IT:CODICE_FISCALE', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['IT:CODICE_FISCALE']!;

  it('accepts valid codice fiscale', () => {
    // RSSMRA85T10A562S is a commonly used test vector
    expect(validate('RSSMRA85T10A562S').valid).toBe(true);
  });
  it('rejects invalid check character', () => {
    expect(validate('RSSMRA85T10A562A').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('RSSMRA85T10A56').valid).toBe(false);
  });
});

// ─── Germany: Steuer-ID ─────────────────────────────────────────────

describe('DE:STEUER_ID', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['DE:STEUER_ID']!;

  it('accepts valid Steuer-ID', () => {
    // 65929970489 — known test vector
    expect(validate('65929970489').valid).toBe(true);
  });
  it('rejects ID starting with 0', () => {
    expect(validate('05929970489').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('6592997048').valid).toBe(false);
  });
});

// ─── France: NIR ────────────────────────────────────────────────────

describe('FR:NIR', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['FR:NIR']!;

  it('accepts valid NIR', () => {
    // 1 85 07 30 033 001 key
    // Number: 1850730033001, key = 97 - (1850730033001 % 97)
    const mainNum = 1850730033001n;
    const key = 97 - Number(mainNum % 97n);
    const nir = `${mainNum}${key.toString().padStart(2, '0')}`;
    expect(validate(nir).valid).toBe(true);
  });
  it('rejects invalid key', () => {
    expect(validate('185073003300199').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('18507300330').valid).toBe(false);
  });
});

// ─── Croatia: OIB ───────────────────────────────────────────────────

describe('HR:OIB', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['HR:OIB']!;

  it('accepts valid OIB', () => {
    expect(validate('94577403194').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('94577403195').valid).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(validate('9457740319').valid).toBe(false);
  });
});

// ─── Bulgaria: EGN ──────────────────────────────────────────────────

describe('BG:EGN', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['BG:EGN']!;

  it('accepts valid EGN', () => {
    // 7523169263: weights [2,4,8,5,10,9,7,3,6]
    // 7*2+5*4+2*8+3*5+1*10+6*9+9*7+2*3+6*6 = 14+20+16+15+10+54+63+6+36 = 234
    // 234 % 11 = 234 - 11*21 = 234-231 = 3 → check=3, d[9]=3
    expect(validate('7523169263').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('7523169260').valid).toBe(false);
  });
});

// ─── Czech Republic: Rodné číslo ────────────────────────────────────

describe('CZ:RODNE_CISLO', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['CZ:RODNE_CISLO']!;

  it('accepts valid 10-digit rodné číslo (divisible by 11)', () => {
    // 7801011110: 7801011110 % 11 = ?
    // We need to find one divisible by 11. 7801011104 / 11 = 709182827.6... no
    // Let's compute: pick 780101111 and find check: 7801011110 % 11
    // 7801011110 / 11 = 709182828.18... not divisible
    // Let's use 7801010006: 7801010006 / 11 = 709182727.818... no
    // A known valid one: 7103241116 → 7103241116 / 11 = 645749192.36... nope
    // Just test with format
    const num = 7801010000;
    const remainder = num % 11;
    const valid = num + (11 - remainder) % 11;
    expect(validate(valid.toString()).valid).toBe(true);
  });
  it('accepts 9-digit format (old)', () => {
    expect(validate('780101111').valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validate('78010111').valid).toBe(false);
  });
});

// ─── Denmark: CPR ───────────────────────────────────────────────────

describe('DK:CPR', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['DK:CPR']!;

  it('accepts valid CPR format', () => {
    expect(validate('0101901234').valid).toBe(true);
  });
  it('accepts with hyphen', () => {
    expect(validate('010190-1234').valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validate('01019012').valid).toBe(false);
  });
});

// ─── Estonia: Isikukood ─────────────────────────────────────────────

describe('EE:ISIKUKOOD', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['EE:ISIKUKOOD']!;

  it('accepts valid isikukood', () => {
    // 37605030299: test with first weight set
    expect(validate('37605030299').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('37605030290').valid).toBe(false);
  });
});

// ─── Greece: AMKA ───────────────────────────────────────────────────

describe('GR:AMKA', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['GR:AMKA']!;

  it('accepts valid AMKA (Luhn-valid 11 digits)', () => {
    // Construct a valid Luhn 11-digit number
    // 01017000000 → check with luhn
    // Let's use a known approach: append check digit to 0101700000
    const base = '0101700000';
    // Calculate Luhn check digit
    const digits = (base + '0').split('').map(Number);
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    expect(validate(base + checkDigit.toString()).valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validate('1234567890').valid).toBe(false);
  });
});

// ─── Ireland: PPSN ──────────────────────────────────────────────────

describe('IE:PPSN', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['IE:PPSN']!;

  it('accepts valid PPS number', () => {
    // 1234567T: 8*1+7*2+6*3+5*4+4*5+3*6+2*7 = 8+14+18+20+20+18+14 = 112
    // 112 % 23 = 112 - 23*4 = 112-92 = 20 → char 'T'
    expect(validate('1234567T').valid).toBe(true);
  });
  it('rejects invalid check character', () => {
    expect(validate('1234567A').valid).toBe(false);
  });
});

// ─── Lithuania: Asmens kodas ────────────────────────────────────────

describe('LT:ASMENS_KODAS', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['LT:ASMENS_KODAS']!;

  it('accepts valid asmens kodas', () => {
    // Same algorithm as Estonia
    expect(validate('37605030299').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('37605030290').valid).toBe(false);
  });
});

// ─── Portugal: NIF ──────────────────────────────────────────────────

describe('PT:NIF', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['PT:NIF']!;

  it('accepts valid NIF', () => {
    // 123456789: 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8 = 9+16+21+24+25+24+21+16 = 156
    // 156 % 11 = 156 - 14*11 = 156-154 = 2. check = 11-2 = 9. d[8]=9 ✓
    expect(validate('123456789').valid).toBe(true);
  });
  it('rejects invalid check digit', () => {
    expect(validate('123456780').valid).toBe(false);
  });
});

// ─── Romania: CNP ───────────────────────────────────────────────────

describe('RO:CNP', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['RO:CNP']!;

  it('accepts valid CNP', () => {
    // 1850730033005: weights [2,7,9,1,4,6,3,5,8,2,7,9]
    // 1*2+8*7+5*9+0*1+7*4+3*6+0*3+0*5+3*8+3*2+0*7+0*9
    // = 2+56+45+0+28+18+0+0+24+6+0+0 = 179
    // 179 % 11 = 179 - 16*11 = 179-176 = 3. check = 3. But we need 13-digit with check=5?
    // Let me construct a valid one properly:
    const digits = [1, 8, 5, 0, 7, 3, 0, 0, 3, 3, 0, 0];
    const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    const check = remainder === 10 ? 1 : remainder;
    const cnp = digits.join('') + check.toString();
    expect(validate(cnp).valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validate('185073003300').valid).toBe(false);
  });
});

// ─── Slovenia: EMŠO ─────────────────────────────────────────────────

describe('SI:EMSO', () => {
  const validate = EU_PERSONAL_ID_VALIDATORS['SI:EMSO']!;

  it('accepts valid EMŠO', () => {
    // Construct valid: 0101006500006 + check
    const digits = [0, 1, 0, 1, 0, 0, 6, 5, 0, 0, 0, 0];
    const weights = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += digits[i] * weights[i];
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check === 10) return; // skip invalid construction
    const emso = digits.join('') + check.toString();
    expect(validate(emso).valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validate('010100650000').valid).toBe(false);
  });
});

// ─── Regex-only validators ──────────────────────────────────────────

describe('regex-only validators', () => {
  it('AT:ZMR accepts 12 digits', () => {
    expect(EU_PERSONAL_ID_VALIDATORS['AT:ZMR']!('123456789012').valid).toBe(true);
  });
  it('AT:ZMR rejects 11 digits', () => {
    expect(EU_PERSONAL_ID_VALIDATORS['AT:ZMR']!('12345678901').valid).toBe(false);
  });
  it('CY:ARC accepts 1-10 digits', () => {
    expect(EU_PERSONAL_ID_VALIDATORS['CY:ARC']!('1234567').valid).toBe(true);
  });
  it('LV:PERSONAS_KODS accepts correct format', () => {
    expect(EU_PERSONAL_ID_VALIDATORS['LV:PERSONAS_KODS']!('010190-12345').valid).toBe(true);
  });
  it('LU:MATRICULE accepts 13 digits', () => {
    expect(EU_PERSONAL_ID_VALIDATORS['LU:MATRICULE']!('1234567890123').valid).toBe(true);
  });
  it('MT:ID_CARD accepts digits + letter', () => {
    expect(EU_PERSONAL_ID_VALIDATORS['MT:ID_CARD']!('12345A').valid).toBe(true);
  });
});

// ─── EU_PERSONAL_ID_TYPES coverage ──────────────────────────────────

describe('EU_PERSONAL_ID_TYPES', () => {
  it('has entries for all 27 EU countries', () => {
    const countries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
    for (const c of countries) {
      expect(EU_PERSONAL_ID_TYPES[c]).toBeDefined();
      expect(EU_PERSONAL_ID_TYPES[c].length).toBeGreaterThan(0);
    }
  });

  it('has a validator for every listed ID type', () => {
    for (const [country, types] of Object.entries(EU_PERSONAL_ID_TYPES)) {
      for (const idType of types) {
        const key = `${country}:${idType}`;
        expect(EU_PERSONAL_ID_VALIDATORS[key]).toBeDefined();
      }
    }
  });
});

// ─── Company ID validators ──────────────────────────────────────────

describe('validateVAT', () => {
  it('accepts valid Swedish VAT', () => {
    expect(validateVAT('SE556123456701').valid).toBe(true);
  });
  it('accepts valid German VAT', () => {
    expect(validateVAT('DE123456789').valid).toBe(true);
  });
  it('accepts valid French VAT', () => {
    expect(validateVAT('FR12345678901').valid).toBe(true);
  });
  it('accepts Greek VAT with EL prefix', () => {
    expect(validateVAT('EL123456789').valid).toBe(true);
  });
  it('rejects unknown country prefix', () => {
    expect(validateVAT('XX123456789').valid).toBe(false);
  });
  it('rejects too short', () => {
    expect(validateVAT('SE1').valid).toBe(false);
  });
  it('handles spaces and dots', () => {
    expect(validateVAT('SE 5561.2345.6701').valid).toBe(true);
  });
});

describe('validateLEI', () => {
  it('accepts valid LEI', () => {
    expect(validateLEI('5493001KJTIIGC8Y1R12').valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validateLEI('5493001KJTIIGC8Y1R').valid).toBe(false);
  });
  it('rejects invalid mod 97-10', () => {
    expect(validateLEI('5493001KJTIIGC8Y1R99').valid).toBe(false);
  });
});

describe('validateDUNS', () => {
  it('accepts valid 9-digit DUNS', () => {
    expect(validateDUNS('123456789').valid).toBe(true);
  });
  it('accepts DUNS with dashes', () => {
    expect(validateDUNS('12-345-6789').valid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validateDUNS('12345678').valid).toBe(false);
  });
});

describe('validateEORI', () => {
  it('accepts valid EORI', () => {
    expect(validateEORI('SE5561234567').valid).toBe(true);
  });
  it('rejects missing country prefix', () => {
    expect(validateEORI('5561234567').valid).toBe(false);
  });
  it('rejects too long', () => {
    expect(validateEORI('SE1234567890123456').valid).toBe(false);
  });
});

describe('validateCompanyReg', () => {
  it('accepts valid Swedish organisationsnummer with Luhn', () => {
    // 5561234567: needs Luhn check
    // Let's compute: take 556123456 and find Luhn check digit
    // Actually test with a known Luhn-valid 10-digit: 5560360793
    expect(validateCompanyReg('5560360793', 'SE').valid).toBe(true);
  });
  it('rejects invalid Swedish organisationsnummer (Luhn fails)', () => {
    expect(validateCompanyReg('5561234560', 'SE').valid).toBe(false);
  });
  it('accepts valid Danish CVR (8 digits)', () => {
    expect(validateCompanyReg('12345678', 'DK').valid).toBe(true);
  });
  it('accepts valid Finnish Y-tunnus', () => {
    expect(validateCompanyReg('1234567-8', 'FI').valid).toBe(true);
  });
  it('rejects unknown country', () => {
    expect(validateCompanyReg('12345', 'XX').valid).toBe(false);
  });
  it('accepts valid Austrian Firmenbuchnummer', () => {
    expect(validateCompanyReg('FN 123456a', 'AT').valid).toBe(true);
  });
  it('returns country-specific error for invalid Austrian Firmenbuchnummer', () => {
    const result = validateCompanyReg('12345', 'AT');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Firmenbuchnummer');
  });
  it('accepts valid German Handelsregisternummer', () => {
    expect(validateCompanyReg('HRB 12345', 'DE').valid).toBe(true);
  });
  it('returns country-specific error for invalid German HRN', () => {
    const result = validateCompanyReg('12345', 'DE');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Handelsregisternummer');
  });
  it('accepts valid French SIREN', () => {
    expect(validateCompanyReg('123456789', 'FR').valid).toBe(true);
  });
  it('accepts valid Spanish CIF', () => {
    expect(validateCompanyReg('A1234567B', 'ES').valid).toBe(true);
  });
  it('accepts valid Romanian registration', () => {
    expect(validateCompanyReg('J40/123456/2020', 'RO').valid).toBe(true);
  });
  it('accepts valid Hungarian Cégjegyzékszám', () => {
    expect(validateCompanyReg('01-09-123456', 'HU').valid).toBe(true);
  });
  it('accepts valid Cypriot registration', () => {
    expect(validateCompanyReg('HE123456', 'CY').valid).toBe(true);
  });
  it('returns Organisationsnummer in Luhn error for SE', () => {
    const result = validateCompanyReg('5561234560', 'SE');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Organisationsnummer');
  });
});

describe('COMPANY_REG_INFO', () => {
  const EU_COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
  it('has entries for all 27 EU countries', () => {
    for (const code of EU_COUNTRIES) {
      expect(COMPANY_REG_INFO[code], `Missing COMPANY_REG_INFO for ${code}`).toBeDefined();
      expect(COMPANY_REG_INFO[code].name).toBeTruthy();
      expect(COMPANY_REG_INFO[code].placeholder).toBeTruthy();
      expect(COMPANY_REG_INFO[code].help).toBeTruthy();
      expect(COMPANY_REG_INFO[code].errorHint).toBeTruthy();
    }
  });
});

// ─── GLN ───────────────────────────────────────────────────────────────

describe('validateGLN', () => {
  it('accepts valid GLN with correct check digit', () => {
    // 7350053850019 is a valid GLN (GS1 check digit)
    expect(validateGLN('7350053850019').valid).toBe(true);
  });
  it('rejects GLN with wrong length', () => {
    expect(validateGLN('123456789').valid).toBe(false);
  });
  it('rejects GLN with invalid check digit', () => {
    expect(validateGLN('7350053850010').valid).toBe(false);
  });
});

// ─── ISIN ──────────────────────────────────────────────────────────────

describe('validateISIN', () => {
  it('accepts valid ISIN (US Apple)', () => {
    expect(validateISIN('US0378331005').valid).toBe(true);
  });
  it('accepts valid ISIN (GB)', () => {
    expect(validateISIN('GB0002634946').valid).toBe(true);
  });
  it('rejects invalid ISIN check digit', () => {
    expect(validateISIN('US0378331009').valid).toBe(false);
  });
  it('rejects wrong format', () => {
    expect(validateISIN('1234567890AB').valid).toBe(false);
  });
});

// ─── Tax ID ────────────────────────────────────────────────────────────

describe('validateTaxId', () => {
  it('accepts alphanumeric 4-20 chars', () => {
    expect(validateTaxId('ABC123456').valid).toBe(true);
  });
  it('rejects too short', () => {
    expect(validateTaxId('AB1').valid).toBe(false);
  });
  it('rejects too long', () => {
    expect(validateTaxId('A'.repeat(21)).valid).toBe(false);
  });
});

// ─── Chamber of Commerce ──────────────────────────────────────────────

describe('validateChamberOfCommerce', () => {
  it('accepts valid format', () => {
    expect(validateChamberOfCommerce('KVK12345678').valid).toBe(true);
  });
  it('rejects too short', () => {
    expect(validateChamberOfCommerce('AB').valid).toBe(false);
  });
});

// ─── NAICS ─────────────────────────────────────────────────────────────

describe('validateNAICS', () => {
  it('accepts 6-digit NAICS code', () => {
    expect(validateNAICS('541511').valid).toBe(true);
  });
  it('accepts 2-digit sector code', () => {
    expect(validateNAICS('54').valid).toBe(true);
  });
  it('rejects single digit', () => {
    expect(validateNAICS('5').valid).toBe(false);
  });
  it('rejects 7 digits', () => {
    expect(validateNAICS('5415111').valid).toBe(false);
  });
});

// ─── SIC ───────────────────────────────────────────────────────────────

describe('validateSIC', () => {
  it('accepts 4-digit SIC code', () => {
    expect(validateSIC('7372').valid).toBe(true);
  });
  it('rejects 3 digits', () => {
    expect(validateSIC('737').valid).toBe(false);
  });
  it('rejects 5 digits', () => {
    expect(validateSIC('73721').valid).toBe(false);
  });
});
