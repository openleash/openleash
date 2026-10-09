import { Worker } from 'node:worker_threads';
import { portableTransformationPattern, type TransformationRule } from '@openleash/core';

// The worker keeps user-supplied regexes off the HTTP event loop.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
try {
  const rule = workerData.rule;
  const input = workerData.input;
  let output = input;
  if (rule.type === 'cap_output_length') {
    if (rule.max_lines) output = output.split(/(?<=\n)/u).slice(0, rule.max_lines).join('');
    if (rule.max_characters) output = Array.from(output).slice(0, rule.max_characters).join('');
  } else {
    const regex = new RegExp(rule.from_pattern, 'gu');
    const pieces = [];
    let end = 0, size = 0, match;
    while ((match = regex.exec(input)) !== null) {
      const piece = input.slice(end, match.index) + rule.to_pattern;
      size += Array.from(piece).length;
      if (size > 1048576) throw new Error('Transformed output exceeds 1048576 characters');
      pieces.push(piece); end = match.index + match[0].length;
      if (match[0] === '') regex.lastIndex += input.codePointAt(regex.lastIndex) > 65535 ? 2 : 1;
    }
    output = pieces.join('') + input.slice(end);
    if (Array.from(output).length > 1048576) throw new Error('Transformed output exceeds 1048576 characters');
  }
  parentPort.postMessage({ output, modified: output !== input });
} catch (error) { parentPort.postMessage({ error: error.message }); }
`;

export function previewTransformation(rule: TransformationRule, input: string): Promise<{ output: string; modified: boolean }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, { eval: true, workerData: { rule: rule.type === 'regex_replace' ? { ...rule, from_pattern: portableTransformationPattern(rule.from_pattern) } : rule, input }, resourceLimits: { maxOldGenerationSizeMb: 32 } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Transformation exceeded its execution deadline')); }, 250);
    worker.once('message', result => {
      clearTimeout(timer); void worker.terminate();
      if (result.error) reject(new Error(result.error)); else resolve(result);
    });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', () => { clearTimeout(timer); reject(new Error('Transformation worker stopped')); });
  });
}
