// Wide spaces as tabs (#1444). A space the engine set much wider than its
// face's (a contents row's gap before its page number, a label set apart
// from its value) is written as a tab to a stop where the next run
// starts, or a right stop where it ends when it closes the line: Word and
// LibreOffice land it where character spacing would, and Google Docs,
// which drops character spacing, keeps the gap instead of running the
// number on after the title.

import type { DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { fontSizePx } from './metrics.js';
import { joinWordRuns, naturalTwips, runGaps, runProps, unpadded, writtenFace, type EmittedRun } from './runs.js';
import { twips } from './units.js';
import type { WriterContext } from './types.js';

/** A space becomes a tab when it is this many times its natural advance… */
const TAB_FACTOR = 3;
/** …and at least this much wider than it, twips. */
const TAB_MIN_TW = 180;

export interface TabStop {
  val: 'left' | 'right';
  /** Twips from the box's left edge. */
  pos: number;
}

/** The runs of a line as the writer emits them (padding taken out, word
 *  pieces joined). */
export function emittedRuns(line: DisplayLine): { line: DisplayLine; runs: { run: DisplayRun; gap: number }[] } {
  const flat = unpadded(line, runGaps(line));
  return { line: flat.line, runs: joinWordRuns(flat.line, flat.gaps) };
}

const SPACE = /^[   -   　]$/;

/** A wide space written as a tab, in its word's face with no spacing
 *  (spacing after a tab would push the next run past its stop). The
 *  export map reads it as a tab, as the importer does. */
export function tabRun(ctx: WriterContext, run: DisplayRun, line: DisplayLine): EmittedRun {
  const rPr = runProps(ctx, { ...run, fontString: writtenFace(run, line) }, {});
  return { rPr, text: '\t', xml: `<w:r>${rPr}<w:tab/></w:r>` };
}

/** The tab stops of a line's wide spaces, by index into its emitted runs.
 *  Only flush-left lines: in a centred or right-aligned paragraph a
 *  renderer moves the whole line by its alignment and lays out tab stops
 *  in its own way, so the text after the tab would not land on its x. */
function lineTabs(ctx: WriterContext, line: DisplayLine, boxL: number): Map<number, TabStop> {
  const out = new Map<number, TabStop>();
  if (line.rtl || line.vertical || line.align !== 'left') return out;
  const { line: flat, runs } = emittedRuns(line);
  runs.forEach(({ run }, k) => {
    if (!SPACE.test(run.text) || run.inline || run.rtl) return;
    const face = writtenFace(run, flat);
    const nat = naturalTwips(ctx, face, run.text) ?? Math.round((fontSizePx(face) * 1440) / ctx.dpi / 4);
    const width = twips(run.width, ctx.dpi);
    if (width < TAB_FACTOR * nat || width - nat < TAB_MIN_TW) return;
    const rest = runs.slice(k + 1).filter((r) => r.run.text.length > 0);
    const next = rest[0]?.run;
    if (!next) return;
    // The last run of the line: flush to its end, whatever its width in
    // the renderer's face.
    const stop: TabStop = rest.length === 1 ? { val: 'right', pos: twips(next.x + next.width - boxL, ctx.dpi) } : { val: 'left', pos: twips(next.x - boxL, ctx.dpi) };
    out.set(k, stop);
  });
  return out;
}

/** The tabs of a paragraph's lines (`lines`, each its runs' indices that
 *  are tabs) and the `w:tabs` its pPr holds; none when a tab would stop
 *  short at a stop meant for another line (or at the hanging indent,
 *  which Word takes for a stop), so each one lands on its own. */
export function paragraphTabs(ctx: WriterContext, lines: readonly DisplayLine[], boxL: number, indentTw: number): { lines: Set<number>[]; xml: string } {
  const per = lines.map((l) => lineTabs(ctx, l, boxL));
  const none = { lines: lines.map(() => new Set<number>()), xml: '' };
  const stops = new Map<number, TabStop>();
  for (const m of per) for (const s of m.values()) stops.set(s.pos, s);
  if (stops.size === 0) return none;
  const positions = [...stops.keys(), indentTw];
  for (let i = 0; i < lines.length; i++) {
    const { runs } = emittedRuns(lines[i]!);
    for (const [k, s] of per[i]!) {
      const from = twips(runs[k]!.run.x - boxL, ctx.dpi);
      if (s.pos <= from || positions.some((p) => p > from && p < s.pos)) return none;
    }
  }
  const sorted = [...stops.values()].sort((a, b) => a.pos - b.pos);
  return {
    lines: per.map((m) => new Set(m.keys())),
    xml: `<w:tabs>${sorted.map((s) => `<w:tab w:val="${s.val}" w:pos="${s.pos}"/>`).join('')}</w:tabs>`,
  };
}
