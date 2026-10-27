// Vertical alternates through a twin face: registering, probing and loading
// the `vert` twins of CJK fonts.
import { baseFontFamily } from '../../fonts/figureStyle.js';
import { measureContextText } from '../contextText.js';

// ---------------------------------------------------------------------------
// Vertical alternates through a twin face
// ---------------------------------------------------------------------------

export const twins = new Map<string, string>();
/** The faces {@link loadVerticalAlternates} added for a family's twin. */
const twinFaces = new Map<string, FontFace[]>();
/** Per family, the faces its twin holds, by source and descriptors
 *  ({@link faceKey}): a later call adds only the others. */
const twinFaceKeys = new Map<string, Set<string>>();
/** Per family, how many times its twin was loaded or dropped: a load that
 *  another one (or an unregister) overtook while it waited is stale. */
const twinGeneration = new Map<string, number>();

/**
 * Paint the vertical forms of `family`'s punctuation (brackets, quotes,
 * mainland pause marks, ellipses) with `twinFamily`: the same font loaded
 * under that name with `featureSettings: '"vert" 1'` (see
 * {@link loadVerticalAlternates}). Hosts that load fonts themselves call
 * this once the twin is ready; without one the painter's fallbacks apply.
 */
export function registerVerticalAlternates(family: string, twinFamily: string): void {
  twins.set(family, twinFamily);
  // The host's twin: a later `loadVerticalAlternates` adds nothing to it.
  twinFaceKeys.delete(family);
}

function removeFaces(faces: readonly FontFace[] | undefined): void {
  if (!faces || typeof document === 'undefined' || !document.fonts) return;
  for (const ff of faces) {
    try {
      document.fonts.delete(ff);
    } catch {
      // Already gone.
    }
  }
}

/** Forget the twin of `family` (or of every family), removing the faces
 *  {@link loadVerticalAlternates} added for it: the family's font changed
 *  (a file uploaded again under the same name), so its twin must be loaded
 *  again from the new sources. A load still under way for it is dropped. */
export function unregisterVerticalAlternates(family?: string): void {
  const families = family === undefined ? [...new Set([...twins.keys(), ...twinFaces.keys(), ...twinGeneration.keys()])] : [family];
  for (const f of families) {
    twins.delete(f);
    removeFaces(twinFaces.get(f));
    twinFaces.delete(f);
    twinFaceKeys.delete(f);
    twinGeneration.set(f, (twinGeneration.get(f) ?? 0) + 1);
  }
}

/** The twin family registered for `family`, if any. */
export function verticalAlternatesOf(family: string): string | undefined {
  return twins.get(family) ?? twins.get(baseFontFamily(family));
}

/** The family name a twin of `family` is registered under by
 *  {@link loadVerticalAlternates}. */
export function verticalTwinName(family: string): string {
  return `${family} postext-vert`;
}

/** One face of a family: its source (a URL or the font bytes) and
 *  descriptors, as `new FontFace` takes them. */
export interface VerticalAlternatesFace {
  source: string | ArrayBuffer;
  weight?: string;
  style?: string;
  unicodeRange?: string;
}

/** The twin's features. `fwid` with `vert`: the full-width forms of
 *  dashes, whose vertical form Noto CJK keys to both; the marks the twin
 *  paints are full-width already. */
const TWIN_FEATURES = '"vert" 1, "fwid" 1';

/** Brackets the probe compares: their vertical forms differ from the
 *  horizontal ones in every CJK face. */
const PROBE = '「（《';
/** The characters a twin is loaded for (only these ever paint with it):
 *  the brackets, quotes and pause marks, and the dashes, ellipses, wave
 *  dashes, 〝〟, ー and small kana of Japanese text. A face cut into
 *  `unicodeRange` slices (a Japanese web font has a hundred) loads the
 *  slices that hold them, which a canvas does not wait for when it paints. */
export const VERTICAL_ALTERNATE_SAMPLE = '「」『』（）《》〈〉【】〔〕〖〗［］｛｝，。、：；！？“”‘’…～'
  + '‥〜〝〟゠ーぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ';

export function inkKey(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, font: string, text: string): string {
  ctx.font = font;
  const m = measureContextText(ctx, text);
  return [m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]
    .map((v) => Math.round((v ?? 0) * 10))
    .join(',');
}

/** A face descriptor's weight as the range it covers (`'400'`, `'bold'`,
 *  a variable face's `'100 900'`). */
function weightRange(weight: string | undefined): [number, number] {
  const w = weight?.trim().toLowerCase();
  if (!w || w === 'normal') return [400, 400];
  if (w === 'bold') return [700, 700];
  const n = w.split(/\s+/).map(Number).filter(Number.isFinite);
  return n.length === 0 ? [400, 400] : [n[0]!, n[1] ?? n[0]!];
}

/** The keyword a face descriptor's style starts with (`'oblique 10deg'`
 *  is `'oblique'`). */
function styleKeyword(style: string | undefined): string {
  const s = style?.trim().toLowerCase().split(/\s+/)[0];
  return s === 'italic' || s === 'oblique' ? s : 'normal';
}

/**
 * The faces the probe draws with, and the font shorthand's weight and
 * style for them: the regular face when the twin holds one (the text face),
 * else the first face given, with every face that shares its weight and
 * style (the files of a face cut into `unicodeRange` slices). A twin of
 * the bold faces alone is probed in bold: drawn at the default weight it
 * would be compared with the regular face and differ from it whatever the
 * feature did (#220).
 */
function probeFaces(faces: readonly VerticalAlternatesFace[]): { prefix: string; faces: VerticalAlternatesFace[] } {
  const regular = faces.find((f) => {
    const [lo, hi] = weightRange(f.weight);
    return styleKeyword(f.style) === 'normal' && lo <= 400 && 400 <= hi;
  });
  const chosen = regular ?? faces[0]!;
  const [lo, hi] = weightRange(chosen.weight);
  const style = styleKeyword(chosen.style);
  const weight = Math.min(hi, Math.max(lo, 400));
  const same = faces.filter((f) => (f.weight ?? '') === (chosen.weight ?? '') && (f.style ?? '') === (chosen.style ?? ''));
  return { prefix: `${style === 'normal' ? '' : `${style} `}${weight} `, faces: same };
}

/** A face by its source and descriptors. Bytes are told apart by
 *  identity: the same buffer passed again is the same face. */
const bufferIds = new WeakMap<ArrayBuffer, number>();
let nextBufferId = 0;
function faceKey(face: VerticalAlternatesFace): string {
  let source: string;
  if (typeof face.source === 'string') source = face.source;
  else {
    let id = bufferIds.get(face.source);
    if (id === undefined) {
      id = nextBufferId++;
      bufferIds.set(face.source, id);
    }
    source = `#${id}`;
  }
  return `${source}|${face.weight ?? ''}|${face.style ?? ''}|${face.unicodeRange ?? ''}`;
}

/** Add `faces` to `document.fonts` under `family`, with `featureSettings`
 *  when given; returns those the browser took. */
function addFaces(family: string, faces: readonly VerticalAlternatesFace[], featureSettings?: string): FontFace[] {
  const added: FontFace[] = [];
  for (const face of faces) {
    try {
      const src = typeof face.source === 'string' ? `url(${JSON.stringify(face.source)})` : face.source;
      const ff = new FontFace(family, src, {
        ...(face.weight ? { weight: face.weight } : {}),
        ...(face.style ? { style: face.style } : {}),
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
        ...(featureSettings ? { featureSettings } : {}),
      });
      document.fonts.add(ff);
      added.push(ff);
    } catch {
      // A face the browser refuses: the others may still cover the marks.
    }
  }
  return added;
}

/**
 * Load a twin of `family` with its vertical forms on (`featureSettings:
 * '"vert" 1'`) from the same sources, and register it when the browser
 * applies the feature to canvas text. The probe draws 「（《 with the twin
 * and with a copy of the same faces loaded without the feature, at the
 * weight and style of the faces the twin holds, and compares their ink; the
 * copy is removed afterwards. A twin whose faces leave the brackets as they
 * are (Chrome before 140 ignores `featureSettings` on canvas text) is not
 * registered, and the painter's fallbacks apply. Resolves to whether the
 * twin is in use. Browser only; a no-op (false) elsewhere.
 */
export async function loadVerticalAlternates(family: string, faces: readonly VerticalAlternatesFace[]): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined' || faces.length === 0) return false;
  const registered = twins.get(family);
  if (registered !== undefined) {
    // A twin this browser was found to apply the feature to: the faces a
    // later call brings (the bold of a family whose regular face came
    // first) join it, so bold punctuation is not the regular face made
    // heavier. A twin the host registered itself is left to the host.
    const keys = twinFaceKeys.get(family);
    const own = twinFaces.get(family);
    if (!keys || !own) return true;
    const fresh = faces.filter((f) => !keys.has(faceKey(f)));
    if (fresh.length === 0) return true;
    const added = addFaces(registered, fresh, TWIN_FEATURES);
    for (const f of fresh) keys.add(faceKey(f));
    own.push(...added);
    try {
      const probe = probeFaces(fresh);
      await document.fonts.load(`${probe.prefix}16px ${JSON.stringify(registered)}`, VERTICAL_ALTERNATE_SAMPLE);
    } catch {
      // The faces load when first painted.
    }
    return true;
  }
  const generation = (twinGeneration.get(family) ?? 0) + 1;
  twinGeneration.set(family, generation);
  // A family loaded again (after `unregisterVerticalAlternates`) takes a
  // fresh name, so no face or glyph cache of the old file answers for it.
  const twin = generation > 1 ? `${verticalTwinName(family)} ${generation}` : verticalTwinName(family);
  const loaded = addFaces(twin, faces, TWIN_FEATURES);
  if (loaded.length === 0) return false;
  const probe = probeFaces(faces);
  const plainName = `${family} postext-probe ${generation}`;
  const plain = addFaces(plainName, probe.faces);
  const q = (f: string) => JSON.stringify(f);
  const current = () => twinGeneration.get(family) === generation;
  let applied = false;
  try {
    await Promise.all([
      document.fonts.load(`${probe.prefix}16px ${q(twin)}`, VERTICAL_ALTERNATE_SAMPLE),
      document.fonts.load(`${probe.prefix}16px ${q(plainName)}`, PROBE),
    ]);
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    applied = !!ctx && plain.length > 0 && current()
      && inkKey(ctx, `${probe.prefix}100px ${q(twin)}`, PROBE) !== inkKey(ctx, `${probe.prefix}100px ${q(plainName)}`, PROBE);
  } catch {
    applied = false;
  }
  removeFaces(plain);
  if (applied) {
    twins.set(family, twin);
    twinFaces.set(family, loaded);
    twinFaceKeys.set(family, new Set(faces.map(faceKey)));
  } else removeFaces(loaded);
  return applied;
}
