// Content fingerprints (#629): a configuration's text with its keys
// sorted, hashed, so equal content gives an equal key whatever object it
// came through (the Sandbox's layout records), and the quick fingerprint a
// build checks a cached configuration against.

/** JSON with sorted object keys and the keys in `skip` left out, so equal
 *  content gives equal text whatever the object came through. */
export function stableStringify(value: unknown, skip?: ReadonlySet<string>): string {
  return JSON.stringify(value, function replacer(this: unknown, key: string, v: unknown) {
    if (skip?.has(key)) return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

/** djb2 over a string, as 8 hex digits and the length in hex: short enough
 *  to store per record, distinct enough to tell configurations apart. */
export function hashString(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

/** Two independent 32-bit hashes side by side (djb2 and sdbm) and the
 *  length: for keys that must not confuse two long texts. */
export function hashStringWide(text: string): string {
  let a = 5381;
  let b = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = ((a << 5) + a + c) | 0;
    b = (c + (b << 6) + (b << 16) - b) | 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

/** {@link hashString} of {@link stableStringify}. */
export function stableHash(value: unknown, skip?: ReadonlySet<string>): string {
  return hashString(stableStringify(value, skip) ?? '');
}

/**
 * The text of one configuration object as it is now, for telling whether
 * it changed in place since it was resolved: plain `JSON.stringify` (the
 * keys of one object keep their order, so no sorting is needed), which
 * costs about 0.2 ms on a 55 KB book configuration. Undefined when the
 * object cannot be written as JSON (a cycle).
 */
export function configFingerprint(config: object): string | undefined {
  try {
    return JSON.stringify(config);
  } catch {
    return undefined;
  }
}
