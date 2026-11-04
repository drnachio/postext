// One exported fragment of text (#1389/#1390): the characters as they stand
// in the Word file, the source offset of each, its atoms and formats, and
// the hidden bookmark that wraps it. The writer builds the run XML and the
// fragment side by side, so the text read back between the bookmark's
// start and end is exactly `text` while nothing was edited.
//
// Reading conventions the importer relies on:
// - `w:t` text counts as written; `w:tab` is '\t'; `w:br` (no type) '\n';
// - an equation (`m:oMath`, `m:oMathPara`) or a `w:footnoteReference`
//   counts as one U+FFFC;
// - `w:instrText` (XE index fields) and bookmarks count as nothing;
// - an atom spans from its `at` to the next mapped character (map ≥ 0),
//   the next atom or the end of the text, whichever comes first.

import { bookmarkEndXml, bookmarkName, bookmarkStartXml, newFragmentId } from '../anchors/bookmarks.js';
import type { FragmentTarget, MapFormat, MapFragment } from '../anchors/types.js';
import type { DocxPackageBuilder } from '../ooxml/types.js';
import { UNWRITABLE } from './wml.js';

export const OBJECT_CHAR = '\uFFFC';

export class FragmentBuilder {
  text = '';
  map: number[] = [];
  atoms: { at: number; start: number; end: number; kind: string }[] = [];
  formats: MapFormat[] = [];

  /** Append characters; `map` gives each one's source offset (-1 =
   *  synthetic). `flags`/`href` record the formatting of the piece. */
  push(text: string, map: readonly number[], flags = '', href?: string): void {
    if (!text) return;
    const start = this.text.length;
    UNWRITABLE.lastIndex = 0;
    if (UNWRITABLE.test(text)) {
      // Characters the runs leave out (textRuns) are left out here too.
      UNWRITABLE.lastIndex = 0;
      const drop = new Set<number>();
      for (let m = UNWRITABLE.exec(text); m; m = UNWRITABLE.exec(text)) drop.add(m.index);
      for (let k = 0; k < text.length; k++) {
        if (drop.has(k)) continue;
        this.text += text[k];
        this.map.push(map[k] ?? -1);
      }
    } else {
      this.text += text;
      for (let k = 0; k < text.length; k++) this.map.push(map[k] ?? -1);
    }
    if (this.text.length > start) this.format(start, this.text.length, flags, href);
  }

  /** Append an atom: `text` (one char or a rendered label) stands for the
   *  whole source range `[start, end)`. */
  atom(text: string, start: number, end: number, kind: string, flags = ''): void {
    const at = this.text.length;
    this.atoms.push({ at, start, end, kind });
    this.push(text, new Array<number>(text.length).fill(-1), flags);
  }

  private format(start: number, end: number, flags: string, href: string | undefined): void {
    if (!flags && !href) return;
    const last = this.formats[this.formats.length - 1];
    if (last && last.end === start && last.flags === flags && last.href === href) {
      last.end = end;
      return;
    }
    this.formats.push({ start, end, flags, ...(href ? { href } : {}) });
  }
}

/** Collects the fragments of the document in reading order and hands out
 *  fragment ids and bookmark ids. */
export class FragmentLog {
  readonly body: MapFragment[] = [];
  /** Footnote fragments: listed after the body (footnotes.xml is read
   *  after document.xml). */
  readonly notes: MapFragment[] = [];
  private counter = 0;

  constructor(private readonly pkg: DocxPackageBuilder) {}

  /**
   * Wrap `runs` (the run XML of the fragment's text) in a fresh `_ptx_`
   * bookmark and record the fragment. Returns the wrapped XML. A fragment
   * with no text records nothing (but keeps the runs).
   */
  wrap(
    runs: string,
    f: FragmentBuilder,
    info: { block: string; part?: number; target: FragmentTarget; range: [number, number]; role?: string; note?: boolean },
  ): string {
    if (!f.text) return runs;
    const id = newFragmentId(this.counter++);
    const bm = this.pkg.nextBookmarkId();
    const fragment: MapFragment = {
      id,
      block: info.block,
      part: info.part ?? 0,
      target: info.target,
      text: f.text,
      map: f.map,
      ...(f.atoms.length ? { atoms: f.atoms } : {}),
      ...(f.formats.length ? { formats: f.formats } : {}),
      range: info.range,
      ...(info.role ? { role: info.role } : {}),
    };
    (info.note ? this.notes : this.body).push(fragment);
    return bookmarkStartXml(bm, bookmarkName(id)) + runs + bookmarkEndXml(bm);
  }

  all(): MapFragment[] {
    return [...this.body, ...this.notes];
  }
}
