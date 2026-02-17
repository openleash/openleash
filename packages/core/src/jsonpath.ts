/**
 * Minimal JSONPath accessor.
 * Supports dot access and array indexes only:
 *   $.payload.amount_minor
 *   $.payload.items[0].sku
 */
export function jsonPathGet(obj: unknown, path: string): unknown {
  if (!path.startsWith('$.')) {
    throw new Error(`Invalid JSONPath: must start with "$." — got "${path}"`);
  }

  const stripped = path.slice(2); // remove "$."
  const segments = parseSegments(stripped);

  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (seg.type === 'key') {
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[seg.value];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[seg.value];
    }
  }
  return current;
}

interface KeySegment { type: 'key'; value: string }
interface IndexSegment { type: 'index'; value: number }
type Segment = KeySegment | IndexSegment;

function parseSegments(path: string): Segment[] {
  const segments: Segment[] = [];
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)|\[(\d+)\]|\./g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) {
      segments.push({ type: 'key', value: m[1] });
    } else if (m[2] !== undefined) {
      segments.push({ type: 'index', value: parseInt(m[2], 10) });
    }
    // dots are just separators
  }
  return segments;
}
