// Base64 for the export map without `btoa`/`atob` (absent in some Workers,
// limited to Latin-1 strings and slow on large inputs when spread through
// `String.fromCharCode`). Encodes in fixed chunks; decoding skips whitespace.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

const CHUNK = 3 * 4096;

export function base64Encode(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let out = '';
    for (let i = start; i < end; i += 3) {
      const a = bytes[i]!;
      const b = i + 1 < end ? bytes[i + 1]! : 0;
      const c = i + 2 < end ? bytes[i + 2]! : 0;
      const n = (a << 16) | (b << 8) | c;
      out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
      out += i + 1 < end ? ALPHABET[(n >> 6) & 63]! : '=';
      out += i + 2 < end ? ALPHABET[n & 63]! : '=';
    }
    parts.push(out);
  }
  return parts.join('');
}

export function base64Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const v = code < 128 ? LOOKUP[code]! : -1;
    if (v < 0) throw new Error('base64Decode: invalid character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}
