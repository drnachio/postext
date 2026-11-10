// The look of a run as a reader sees it (#1458): bold, italic, small
// caps, raised or lowered, set in a monospaced face, in capitals, hidden,
// whatever says so: the run's own properties, its character style or its
// paragraph's style. An editor that keeps no style names (Google Docs)
// writes each style's formatting on every run, so the run properties
// alone no longer tell a word made bold from a heading; the look does,
// compared with the look the same text had in the file as it was written.

import { attr, child, children, localName, onOff, type XmlElement } from '../xml.js';

/** Look letters besides the format flags `bicpsk`: `u` capitals
 *  (`w:caps`), `h` hidden (`w:vanish`). */
export const LOOK_CAPS = 'u';
export const LOOK_HIDDEN = 'h';

/** A monospaced face by its name. */
export const MONO_FACE = /mono|courier|consolas|menlo|typewriter/i;

/** What a set of run properties says; undefined where it says nothing. */
interface RunLook {
  b?: boolean;
  i?: boolean;
  c?: boolean;
  u?: boolean;
  h?: boolean;
  /** `p` raised, `s` lowered, '' on the line. */
  va?: string;
  mono?: boolean;
}

function lookOf(rPr: XmlElement | undefined): RunLook {
  const out: RunLook = {};
  if (!rPr) return out;
  for (const c of children(rPr)) {
    switch (localName(c.name)) {
      case 'b':
        out.b = onOff(c) ?? true;
        break;
      case 'i':
        out.i = onOff(c) ?? true;
        break;
      case 'smallCaps':
        out.c = onOff(c) ?? true;
        break;
      case 'caps':
        out.u = onOff(c) ?? true;
        break;
      case 'vanish':
        out.h = onOff(c) ?? true;
        break;
      case 'vertAlign': {
        const v = attr(c, 'val');
        out.va = v === 'superscript' ? 'p' : v === 'subscript' ? 's' : '';
        break;
      }
      case 'rFonts': {
        const face = attr(c, 'ascii') ?? attr(c, 'hAnsi');
        if (face !== undefined) out.mono = MONO_FACE.test(face);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

const over = (base: RunLook, top: RunLook): RunLook => ({ ...base, ...top });

/** The styles of a file, each with the look it gives a run. */
export interface StyleLooks {
  /** The look of a run of `rPr` in a paragraph of style `pStyle`, as
   *  letters in a fixed order: `bicpsk`, then `u` and `h`. */
  look(pStyle: string | undefined, rPr: XmlElement | undefined): string;
  /** Some style or run of the file sets text in capitals (`w:caps`): its
   *  editor keeps the mark, and does not type the capitals out. */
  caps: boolean;
}

/** Read the styles part (`w:styles`); with none, runs have the look
 *  their own properties give them. */
export function styleLooks(styles: XmlElement | undefined): StyleLooks {
  const own = new Map<string, { based?: string; look: RunLook; code: boolean }>();
  let defaults: RunLook = {};
  let normal: string | undefined;
  let caps = false;
  for (const el of children(styles)) {
    const name = localName(el.name);
    if (name === 'docDefaults') {
      defaults = lookOf(child(child(el, 'rPrDefault'), 'rPr'));
    } else if (name === 'style') {
      const id = attr(el, 'styleId') ?? '';
      const look = lookOf(child(el, 'rPr'));
      if (look.u) caps = true;
      own.set(id, { based: attr(child(el, 'basedOn'), 'val'), look, code: /code|verbatim/i.test(id) });
      const isDefault = attr(el, 'default');
      if (attr(el, 'type') === 'paragraph' && (isDefault === '1' || isDefault === 'true')) normal = id;
    }
  }
  const resolved = new Map<string, RunLook>();
  const resolve = (id: string | undefined, depth = 0): RunLook => {
    if (id === undefined) return {};
    const got = resolved.get(id);
    if (got) return got;
    const s = own.get(id);
    if (!s || depth > 16) return {};
    const out = over(resolve(s.based, depth + 1), s.look);
    // A character style named for code marks code, whatever its face.
    if (s.code) out.mono = true;
    resolved.set(id, out);
    return out;
  };
  const state = { caps };
  return {
    get caps() {
      return state.caps;
    },
    look(pStyle, rPr) {
      const direct = lookOf(rPr);
      if (direct.u) state.caps = true;
      const rStyle = attr(child(rPr, 'rStyle'), 'val');
      const l = over(over(over(defaults, resolve(pStyle ?? normal)), resolve(rStyle)), direct);
      return `${l.b ? 'b' : ''}${l.i ? 'i' : ''}${l.c ? 'c' : ''}${l.va === 'p' ? 'p' : ''}${l.va === 's' ? 's' : ''}${l.mono ? 'k' : ''}${l.u ? LOOK_CAPS : ''}${l.h ? LOOK_HIDDEN : ''}`;
    },
  };
}
