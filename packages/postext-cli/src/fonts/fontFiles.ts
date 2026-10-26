// A font file's metadata read with fontkit, its bytes and the faces of a
// font folder (#1276: split out of fonts.ts).
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { decompressWoff2 } from 'postext-pdf';
import type { Face } from '../fonts';

// ---------------------------------------------------------------------------
// Reading font files
// ---------------------------------------------------------------------------

interface FontMeta {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

let fontkitModule: typeof import('@pdf-lib/fontkit') | undefined;

/** Family, weight and style of a TrueType / OpenType file, from its tables. */
export async function readFontMeta(bytes: Uint8Array): Promise<FontMeta | undefined> {
  fontkitModule ??= await import('@pdf-lib/fontkit');
  const fontkit = (fontkitModule as unknown as { default?: typeof import('@pdf-lib/fontkit') }).default ?? fontkitModule;
  try {
    const font = fontkit.create(bytes) as unknown as {
      getName(key: string): string | null;
      familyName: string;
      italicAngle: number;
      'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } };
    };
    const family = font.getName('preferredFamily') ?? font.familyName;
    if (!family) return undefined;
    const os2 = font['OS/2'];
    const italic = os2?.fsSelection?.italic === true || (font.italicAngle ?? 0) !== 0;
    return { family, weight: os2?.usWeightClass ?? 400, style: italic ? 'italic' : 'normal' };
  } catch {
    return undefined;
  }
}

const FONT_EXT = new Set(['.ttf', '.otf', '.woff2']);

/** TrueType / OpenType bytes of a font file (WOFF2 decoded). */
export async function fontBytes(file: string, bytes: Uint8Array): Promise<{ bytes: Uint8Array; format: 'ttf' | 'otf' }> {
  if (extname(file).toLowerCase() === '.woff2') return { bytes: await decompressWoff2(bytes), format: 'ttf' };
  return { bytes, format: extname(file).toLowerCase() === '.otf' ? 'otf' : 'ttf' };
}

/** Every font in `dir`, with the family, weight and style its tables give. */
export async function scanFontDir(dir: string): Promise<Face[]> {
  const out: Face[] = [];
  const walk = async (d: string) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.')) continue;
      const path = join(d, name);
      if (statSync(path).isDirectory()) {
        await walk(path);
        continue;
      }
      if (!FONT_EXT.has(extname(name).toLowerCase())) continue;
      const decoded = await fontBytes(name, new Uint8Array(readFileSync(path))).catch(() => undefined);
      if (!decoded) continue;
      const meta = await readFontMeta(decoded.bytes);
      if (meta) out.push({ ...meta, ...decoded, source: 'font-dir' });
    }
  };
  if (existsSync(dir)) await walk(dir);
  return out;
}
