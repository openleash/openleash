import { describe, it, expect } from 'vitest';
import {
  ACTION_TAXONOMY,
  getTaxonomyNode,
  getTaxonomyChildren,
  getTaxonomyDescendants,
  isKnownAction,
  getTaxonomyCategories,
  flattenTaxonomy,
} from '../src/taxonomy.js';

describe('taxonomy', () => {
  it('defines 9 top-level categories', () => {
    expect(ACTION_TAXONOMY).toHaveLength(9);
    const paths = ACTION_TAXONOMY.map((n) => n.path);
    expect(paths).toEqual([
      'communication', 'commerce', 'finance', 'data', 'web',
      'scheduling', 'legal', 'healthcare', 'system',
    ]);
  });

  it('getTaxonomyNode looks up a top-level category', () => {
    const node = getTaxonomyNode('communication');
    expect(node).toBeDefined();
    expect(node!.label).toBe('Communication');
    expect(node!.children).toBeDefined();
  });

  it('getTaxonomyNode looks up a deeply nested leaf', () => {
    const node = getTaxonomyNode('communication.email.send');
    expect(node).toBeDefined();
    expect(node!.label).toBe('Send Email');
    expect(node!.children).toBeUndefined();
  });

  it('getTaxonomyNode returns undefined for unknown paths', () => {
    expect(getTaxonomyNode('nonexistent')).toBeUndefined();
    expect(getTaxonomyNode('communication.carrier_pigeon')).toBeUndefined();
  });

  it('getTaxonomyChildren returns immediate children', () => {
    const children = getTaxonomyChildren('communication');
    const paths = children.map((n) => n.path);
    expect(paths).toEqual([
      'communication.email', 'communication.sms',
      'communication.phone', 'communication.social',
    ]);
  });

  it('getTaxonomyChildren returns empty array for leaf nodes', () => {
    expect(getTaxonomyChildren('communication.email.send')).toEqual([]);
  });

  it('getTaxonomyChildren returns empty array for unknown paths', () => {
    expect(getTaxonomyChildren('nonexistent')).toEqual([]);
  });

  it('getTaxonomyDescendants returns all leaf nodes under a category', () => {
    const descendants = getTaxonomyDescendants('communication.email');
    const paths = descendants.map((n) => n.path);
    expect(paths).toEqual([
      'communication.email.send',
      'communication.email.read',
      'communication.email.delete',
    ]);
  });

  it('getTaxonomyDescendants returns the node itself if it is a leaf', () => {
    const descendants = getTaxonomyDescendants('commerce.purchase');
    expect(descendants).toHaveLength(1);
    expect(descendants[0].path).toBe('commerce.purchase');
  });

  it('getTaxonomyDescendants returns empty array for unknown paths', () => {
    expect(getTaxonomyDescendants('nonexistent')).toEqual([]);
  });

  it('isKnownAction returns true for valid paths', () => {
    expect(isKnownAction('communication')).toBe(true);
    expect(isKnownAction('commerce.purchase')).toBe(true);
    expect(isKnownAction('system.file.write')).toBe(true);
  });

  it('isKnownAction returns false for unknown paths', () => {
    expect(isKnownAction('nonexistent')).toBe(false);
    expect(isKnownAction('communication.fax')).toBe(false);
  });

  it('getTaxonomyCategories returns the same as ACTION_TAXONOMY', () => {
    expect(getTaxonomyCategories()).toBe(ACTION_TAXONOMY);
  });

  it('flattenTaxonomy returns all nodes', () => {
    const all = flattenTaxonomy();
    // Must include all top-level + all nested nodes
    expect(all.length).toBeGreaterThan(9);
    // Every node path must be unique
    const paths = all.map((n) => n.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every node path is consistent with its parent', () => {
    function checkChildren(nodes: typeof ACTION_TAXONOMY, parentPath?: string) {
      for (const node of nodes) {
        if (parentPath) {
          expect(node.path).toMatch(new RegExp(`^${parentPath}\\.`));
        }
        if (node.children) {
          checkChildren(node.children, node.path);
        }
      }
    }
    checkChildren(ACTION_TAXONOMY);
  });

  it('suggestedConstraints are present on financial nodes', () => {
    const purchase = getTaxonomyNode('commerce.purchase');
    expect(purchase?.suggestedConstraints).toContain('amount_max');
    expect(purchase?.suggestedConstraints).toContain('currency');
  });
});
