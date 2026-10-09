import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { TransformationRule } from '@openleash/core';
import { previewTransformation } from '../src/transformation-preview.js';

const vectors = JSON.parse(readFileSync(new URL('./fixtures/transformation-vectors.json', import.meta.url), 'utf8')) as { name: string; input: string; rule: unknown; output: string }[];
for (const vector of vectors) it('portable transformation: ' + vector.name, async () => {
  expect((await previewTransformation(TransformationRule.parse(vector.rule), vector.input)).output).toBe(vector.output);
});
