import type { DataStore } from './store.js';
import type { StateAgentEntry, TransformationFrontmatter } from './types.js';

export function activeTransformation(t: TransformationFrontmatter): boolean {
  return !t.draft || t.draft.status === 'APPROVED';
}

export function compareTransformations(a: TransformationFrontmatter, b: TransformationFrontmatter): number {
  return a.rank - b.rank || a.transformation_id.localeCompare(b.transformation_id);
}

export function effectiveTransformations(store: DataStore, agent: StateAgentEntry): TransformationFrontmatter[] {
  const groupIds = new Set(store.agentGroupMemberships.listByAgent(agent.agent_principal_id).map(m => m.group_id));
  const bound = new Set((store.state.getState().transformation_bindings ?? [])
    .filter(b => b.agent_principal_id === agent.agent_principal_id && b.owner_type === agent.owner_type && b.owner_id === agent.owner_id)
    .map(b => b.transformation_id));
  return store.transformations.listByOwner(agent.owner_type, agent.owner_id)
    .filter(t => activeTransformation(t) && t.enabled && (
      bound.has(t.transformation_id) ||
      (t.applies_to_agent_principal_id ? t.applies_to_agent_principal_id === agent.agent_principal_id :
        t.applies_to_group_id ? groupIds.has(t.applies_to_group_id) : true)
    )).sort(compareTransformations);
}

export function writeTransformation(store: DataStore, record: TransformationFrontmatter): void {
  store.transformations.write(record);
  store.state.updateState(s => {
    s.transformations ??= [];
    const entry = {
      transformation_id: record.transformation_id, owner_type: record.owner_type, owner_id: record.owner_id,
      applies_to_agent_principal_id: record.applies_to_agent_principal_id,
      applies_to_group_id: record.applies_to_group_id ?? null,
      name: record.name, rank: record.rank, path: './transformations/' + record.transformation_id + '.json',
    };
    const index = s.transformations.findIndex(t => t.transformation_id === record.transformation_id);
    if (index < 0) s.transformations.push(entry); else s.transformations[index] = entry;
  });
}

export function removeTransformation(store: DataStore, id: string): void {
  store.transformations.delete(id);
  store.state.updateState(s => {
    s.transformations = (s.transformations ?? []).filter(t => t.transformation_id !== id);
    s.transformation_bindings = (s.transformation_bindings ?? []).filter(b => b.transformation_id !== id);
  });
}

/** Canonical regex semantics shared with the Python runtime: ASCII shorthands,
 * Unicode scalar values, dot excludes LF only, and $ means absolute end. */
export function portableTransformationPattern(pattern: string): string {
  let result = '', inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      const next = pattern[++i];
      if (next === 's') result += inClass ? '\\x20\\t\\n\\r\\f\\v' : '[\\x20\\t\\n\\r\\f\\v]';
      else result += '\\' + next;
    } else if (ch === '[') { inClass = true; result += ch; }
    else if (ch === ']') { inClass = false; result += ch; }
    else if (!inClass && ch === '.') result += '[^\\n]';
    else if (!inClass && ch === '$') result += '(?![\\s\\S])';
    else result += ch;
  }
  return result;
}
