/**
 * A minimal sRGB ICC profile (v2.1, matrix/TRC, D50-adapted primaries),
 * written in code so no profile file has to ship: what a PDF/X-4 file
 * tags RGB content with (`/DefaultRGB [/ICCBased …]`).
 */

const PRIMARIES = {
  r: [0.4360747, 0.2225045, 0.0139322],
  g: [0.3850649, 0.7168786, 0.0971045],
  b: [0.1430804, 0.0606169, 0.7141733],
} as const;
const D50 = [0.9642, 1, 0.8249];

let cached: Uint8Array | undefined;

function s15f16(v: number): number {
  return Math.round(v * 65536) | 0;
}

/** The bytes of the sRGB profile (built once). */
export function srgbProfileBytes(): Uint8Array {
  if (cached) return cached;
  const tags: { sig: string; data: Uint8Array }[] = [];
  const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
  const xyz = (v: readonly number[]) => new Uint8Array([...enc('XYZ '), 0, 0, 0, 0, ...v.flatMap((x) => u32(s15f16(x)))]);
  const name = 'sRGB IEC61966-2.1 (postext)';
  const desc = new Uint8Array([
    ...enc('desc'), 0, 0, 0, 0, ...u32(name.length + 1), ...enc(name), 0,
    // Unicode and ScriptCode parts, empty.
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(67).fill(0),
  ]);
  const cprt = new Uint8Array([...enc('text'), 0, 0, 0, 0, ...enc('No copyright, use freely'), 0]);
  const N = 1024;
  const curve: number[] = [];
  for (let i = 0; i < N; i++) {
    const v = i / (N - 1);
    const lin = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    curve.push(...u16(Math.round(lin * 65535)));
  }
  const trc = new Uint8Array([...enc('curv'), 0, 0, 0, 0, ...u32(N), ...curve]);
  tags.push({ sig: 'desc', data: desc }, { sig: 'cprt', data: cprt }, { sig: 'wtpt', data: xyz(D50) });
  tags.push({ sig: 'rXYZ', data: xyz(PRIMARIES.r) }, { sig: 'gXYZ', data: xyz(PRIMARIES.g) }, { sig: 'bXYZ', data: xyz(PRIMARIES.b) });
  tags.push({ sig: 'rTRC', data: trc }, { sig: 'gTRC', data: trc }, { sig: 'bTRC', data: trc });

  // Layout: header (128) + tag count + table, then data (shared TRC once).
  const tableSize = 4 + tags.length * 12;
  let offset = 128 + tableSize;
  const placed = new Map<Uint8Array, number>();
  const entries: number[] = [];
  const blobs: Uint8Array[] = [];
  for (const t of tags) {
    let at = placed.get(t.data);
    if (at === undefined) {
      at = offset;
      placed.set(t.data, at);
      blobs.push(t.data);
      offset += t.data.length;
      const pad = (4 - (offset % 4)) % 4;
      if (pad) {
        blobs.push(new Uint8Array(pad));
        offset += pad;
      }
    }
    entries.push(...enc(t.sig), ...u32(at), ...u32(t.data.length));
  }
  const size = offset;
  const out = new Uint8Array(size);
  const header = [
    ...u32(size), ...enc('none'), 0x02, 0x10, 0, 0, ...enc('mntr'), ...enc('RGB '), ...enc('XYZ '),
    // Date 2026-01-01 00:00:00.
    ...u16(2026), ...u16(1), ...u16(1), 0, 0, 0, 0, 0, 0,
    // Flags, manufacturer, model (4 each) and attributes (8).
    ...enc('acsp'), ...enc('APPL'), ...new Array<number>(20).fill(0),
    // Rendering intent perceptual, then the PCS illuminant D50.
    0, 0, 0, 0, ...D50.flatMap((x) => u32(s15f16(x))),
    0, 0, 0, 0,
  ];
  out.set(header, 0);
  out.set([...u32(tags.length), ...entries], 128);
  let at = 128 + tableSize;
  for (const b of blobs) {
    out.set(b, at);
    at += b.length;
  }
  cached = out;
  return out;
}
