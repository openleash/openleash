import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';
import type { Policy } from './types.js';

let _ajv: Ajv | null = null;
let _validate: ReturnType<Ajv['compile']> | null = null;

function getValidator(): ReturnType<Ajv['compile']> {
  if (_validate) return _validate;
  _ajv = new Ajv({ allErrors: true, strict: false });
  _validate = _ajv.compile(policyJsonSchema);
  return _validate;
}

export function parsePolicyYaml(yamlStr: string): Policy {
  const parsed = parseYaml(yamlStr);
  const validate = getValidator();
  const valid = validate(parsed);
  if (!valid) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`Policy validation failed: ${errors}`);
  }
  return parsed as Policy;
}

export function validatePolicyYaml(yamlStr: string): { valid: boolean; errors?: string[] } {
  try {
    const parsed = parseYaml(yamlStr);
    const validate = getValidator();
    const valid = validate(parsed);
    if (!valid) {
      return {
        valid: false,
        errors: validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? ['Unknown error'],
      };
    }
    return { valid: true };
  } catch (e: unknown) {
    return { valid: false, errors: [(e as Error).message] };
  }
}

// Inline JSON Schema for policy validation (also exported for docs/policy.schema.json)
export const policyJsonSchema = {
  "title": "openleash policy v1",
  "type": "object",
  "required": ["version", "default", "rules"],
  "properties": {
    "version": { "enum": [1] },
    "default": { "enum": ["allow", "deny"] },
    "rules": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "effect", "action"],
        "properties": {
          "id": { "type": "string" },
          "effect": { "enum": ["allow", "deny"] },
          "action": { "type": "string" },
          "description": { "type": "string" },
          "when": { "$ref": "#/$defs/expr" },
          "constraints": {
            "type": "object",
            "properties": {
              "amount_max": { "type": "number" },
              "amount_min": { "type": "number" },
              "currency": { "type": "array", "items": { "type": "string" } },
              "merchant_domain": { "type": "array", "items": { "type": "string" } },
              "allowed_domains": { "type": "array", "items": { "type": "string" } },
              "blocked_domains": { "type": "array", "items": { "type": "string" } }
            },
            "additionalProperties": false
          },
          "requirements": {
            "type": "object",
            "properties": {
              "min_assurance_level": { "enum": ["LOW", "SUBSTANTIAL", "HIGH"] },
              "credential_scheme": { "type": "string" }
            },
            "additionalProperties": false
          },
          "obligations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["type"],
              "properties": {
                "type": { "type": "string" },
                "params": { "type": "object" }
              }
            }
          },
          "proof": {
            "type": "object",
            "properties": {
              "required": { "type": "boolean" },
              "ttl_seconds": { "type": "number" }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false,
  "$defs": {
    "expr": {
      "oneOf": [
        {
          "type": "object",
          "required": ["all"],
          "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/expr" } } },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["any"],
          "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/expr" } } },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["not"],
          "properties": { "not": { "$ref": "#/$defs/expr" } },
          "additionalProperties": false
        },
        {
          "type": "object",
          "required": ["match"],
          "properties": {
            "match": {
              "type": "object",
              "required": ["path", "op"],
              "properties": {
                "path": { "type": "string", "pattern": "^\\$\\." },
                "op": { "enum": ["eq", "neq", "in", "nin", "lt", "lte", "gt", "gte", "regex", "exists"] },
                "value": {}
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        }
      ]
    }
  }
};
