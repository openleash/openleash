import { stringify as stringifyYaml } from 'yaml';

export const PROFILES: Record<string, Record<string, unknown>> = {
  CONSERVATIVE: {
    purchase_max: 10000,
    purchase_approval_above: 10000,
    allow_hairdresser: false,
    allow_healthcare: false,
    require_stepup_healthcare: false,
    allow_government: false,
    require_stepup_government: false,
    allowed_comm_domains: [],
  },
  BALANCED: {
    purchase_max: 50000,
    purchase_approval_above: 50000,
    allow_hairdresser: true,
    allow_healthcare: true,
    require_stepup_healthcare: true,
    allow_government: true,
    require_stepup_government: true,
    allowed_comm_domains: [],
  },
  AUTONOMOUS: {
    purchase_max: 200000,
    purchase_approval_above: 200000,
    allow_hairdresser: true,
    allow_healthcare: true,
    require_stepup_healthcare: true,
    allow_government: true,
    require_stepup_government: true,
    allowed_comm_domains: [],
  },
};

export function generatePolicyYaml(vars: Record<string, unknown>): string {
  const rules: unknown[] = [];

  // Purchase rules
  if (typeof vars.purchase_max === 'number' && vars.purchase_max > 0) {
    rules.push({
      id: 'purchase_small_allow',
      effect: 'allow',
      action: 'purchase',
      description: `Allow purchases up to ${vars.purchase_max} minor units`,
      constraints: { amount_max: vars.purchase_max },
      proof: { required: true },
    });
  }

  if (typeof vars.purchase_approval_above === 'number') {
    rules.push({
      id: 'purchase_large_approval',
      effect: 'allow',
      action: 'purchase',
      description: `Require approval for purchases above ${vars.purchase_approval_above}`,
      constraints: { amount_min: (vars.purchase_approval_above as number) + 1 },
      obligations: [{ type: 'HUMAN_APPROVAL', params: { reason: 'Large purchase' } }],
    });
  }

  // Appointment rules
  if (vars.allow_hairdresser) {
    rules.push({
      id: 'appointment_hairdresser_allow',
      effect: 'allow',
      action: 'appointment.book',
      description: 'Allow hairdresser bookings',
      when: { match: { path: '$.payload.category', op: 'eq', value: 'hairdresser' } },
    });
  }

  if (vars.allow_healthcare) {
    const healthRule: Record<string, unknown> = {
      id: 'appointment_healthcare',
      effect: 'allow',
      action: 'appointment.book',
      description: 'Healthcare appointments',
      when: { match: { path: '$.payload.category', op: 'eq', value: 'healthcare' } },
    };
    if (vars.require_stepup_healthcare) {
      healthRule.requirements = { min_assurance_level: 'SUBSTANTIAL' };
    }
    rules.push(healthRule);
  }

  // Government rules
  if (vars.allow_government) {
    const govRule: Record<string, unknown> = {
      id: 'government_submit',
      effect: 'allow',
      action: 'government.*',
      description: 'Government submissions',
    };
    if (vars.require_stepup_government) {
      govRule.requirements = { min_assurance_level: 'HIGH' };
    }
    govRule.proof = { required: true };
    rules.push(govRule);
  } else {
    rules.push({
      id: 'government_deny',
      effect: 'deny',
      action: 'government.*',
      description: 'Deny all government submissions',
    });
  }

  // Communication rules
  const allowedDomains = vars.allowed_comm_domains as string[];
  if (allowedDomains && allowedDomains.length > 0) {
    rules.push({
      id: 'communication_allowed',
      effect: 'allow',
      action: 'communication.*',
      description: 'Allow communication to allowlisted domains',
      constraints: { allowed_domains: allowedDomains },
    });
  }
  rules.push({
    id: 'communication_deny',
    effect: 'deny',
    action: 'communication.*',
    description: 'Deny communication to non-allowlisted domains',
  });

  const policy = {
    version: 1,
    default: 'deny',
    rules,
  };

  return stringifyYaml(policy, { lineWidth: 0 });
}
