// What would make an overflowing frame's content fit, each value worked out
// from the shortfall and tried on the page (#1276: split out of composedLayout.ts).
import type { Dimension } from '../../../types.js';
import type { VDTFrame, FrameOverflowProposal } from '../../../vdt.js';
import { dimensionToPx } from '../../../units.js';
import type { ResolvedFrame, ResolvedPageTemplate, ResolvedFrameGroup } from '../../../composed/types.js';
import { type Composition, type FitState, scaleSteps, PROPOSAL_MIN_SCALE, fixedHeight } from './state.js';

interface ProposalContext {
  frame: ResolvedFrame;
  vdt: VDTFrame;
  cur: Composition;
  fit: FitState;
  compose(fit: FitState, tpl?: ResolvedPageTemplate): Composition;
  overflows(c: Composition, name: string): boolean;
  headOf(name: string): string;
  withText(f: FitState, head: string, s: number): FitState;
  patched(f: FitState, name: string, patch: Partial<ResolvedFrame>): FitState;
  groupOf: ReadonlyMap<string, ResolvedFrameGroup>;
  byName: ReadonlyMap<string, ResolvedFrame>;
  mmPx: number;
  dpi: number;
  emPx: number;
  alternatives?: () => readonly ResolvedPageTemplate[];
  /** The page set with another template as the build would set it (#937):
   *  every frame fits and nothing goes on to another page. */
  fitsWithTemplate?(alt: ResolvedPageTemplate): boolean;
  templateSource?: { sourceStart: number; sourceEnd: number };
  budgetLeft(): boolean;
  /** The frame sets text, which a smaller scale would shrink. */
  holdsText: boolean;
  /** A line of the frame holds nothing but the head of a word wider than
   *  its measure (#1084). */
  dividesWord(c: Composition, name: string): boolean;
}

const mmDim = (value: number): Dimension => ({ value, unit: 'mm' });

/** What would make `frame`'s content fit, each value worked out from the
 *  shortfall and, where the page can tell, tried on it (DESIGN §5.7). */
export function overflowProposals(c: ProposalContext): FrameOverflowProposal[] {
  const { frame, vdt, cur, fit, mmPx } = c;
  const name = frame.name;
  const out: FrameOverflowProposal[] = [];
  const path = (key: string): string => frame.fieldPaths[key] ?? `${frame.configPath}/${key}`;
  const fits = (next: FitState, tpl?: ResolvedPageTemplate): boolean => c.budgetLeft() && !c.overflows(c.compose(next, tpl), name);

  // More shrink: the largest text scale, in 2.5 % steps, at which it fits.
  // When that scale divides a word wider than the frame's measure, the
  // largest smaller one that fits with every word whole, as the ladder
  // prefers (#1084, #1090); none, and the largest that fits, saying the
  // word will be divided.
  const head = c.headOf(name);
  const from = frame.fit.shrinkText ? Math.min(frame.fit.minScale, vdt.scale) : 1;
  const steps = scaleSteps(PROPOSAL_MIN_SCALE, from);
  const shrunk = (i: number): FitState => c.withText(fit, head, steps[i]!);
  if (c.holdsText && steps.length > 0 && fits(shrunk(steps.length - 1))) {
    const last = steps.length - 1;
    /** The largest step from `lo` down at which `ok` holds, given it holds
     *  at the last one: by bisection. */
    const largest = (lo: number, ok: (i: number) => boolean): number => {
      let hi = last;
      while (lo < hi && c.budgetLeft()) {
        const mid = Math.floor((lo + hi) / 2);
        if (ok(mid)) hi = mid;
        else lo = mid + 1;
      }
      return hi;
    };
    let at = largest(0, (i) => fits(shrunk(i)));
    let word: 'whole' | 'divided' | undefined;
    if (c.budgetLeft() && c.dividesWord(c.compose(shrunk(at)), name)) {
      const whole = (i: number): boolean => {
        if (!c.budgetLeft()) return false;
        const comp = c.compose(shrunk(i));
        return !c.overflows(comp, name) && !c.dividesWord(comp, name);
      };
      if (at < last && whole(last)) {
        at = largest(at + 1, whole);
        word = 'whole';
      } else word = 'divided';
    }
    out.push({
      kind: 'allowShrink',
      path: path('fit/minScale'),
      value: steps[at]!,
      ...(frame.fit.shrinkText ? {} : { also: [{ path: path('fit/shrinkText'), value: true }] }),
      ...(word ? { word } : {}),
    });
  }

  // A frame that holds content (an empty one is short of its own box, #911:
  // more height, text or pages do not help it).
  const holds = cur.needs.has(name);
  // A higher maximum: the frame's height plus the shortfall, in whole mm.
  const fixed = fixedHeight(frame);
  if (holds && (frame.maxHeight || fixed)) {
    const want = Math.ceil((vdt.rect.height + vdt.overflowPx) / mmPx - 1e-6);
    const patch: Partial<ResolvedFrame> = { maxHeight: mmDim(want), ...(fixed ? { height: 'auto' as const, minHeight: fixed } : {}) };
    if (fits(c.patched(fit, name, patch))) out.push({ kind: 'raiseMax', path: path('maxHeight'), value: mmDim(want) });
  }

  // A lower minimum on a frame of its group that stands at its minimum
  // with less content than that: lowered by the shortfall, not below its
  // content.
  const g = c.groupOf.get(name);
  if (g) {
    for (const other of g.frames) {
      const f = c.byName.get(other);
      // An empty frame's minimum is the room it stands for (an answer
      // space, a picture slot), not room to take (#911).
      if (!f || other === name || f.pin || !f.minHeight || !cur.needs.has(other)) continue;
      const box = cur.frames.find((x) => x.name === other);
      if (!box) continue;
      const minPx = dimensionToPx(f.minHeight, c.dpi, c.emPx);
      const need = cur.needs.get(other)?.() ?? 0;
      if (Math.abs(box.rect.height - minPx) > 0.5 || need >= minPx - mmPx) continue;
      const lowered = Math.max(Math.ceil(need / mmPx - 1e-6), Math.floor((minPx - vdt.overflowPx) / mmPx + 1e-6));
      if (lowered * mmPx >= minPx - 0.5) continue;
      if (fits(c.patched(fit, other, { minHeight: mmDim(lowered) }))) {
        out.push({ kind: 'lowerMin', path: f.fieldPaths.minHeight ?? `${f.configPath}/minHeight`, value: mmDim(lowered), frame: other });
      }
    }
  }

  // An empty frame cut short by its group: a lower minimum of its own, the
  // height it was left (#911).
  if (!holds && g && frame.minHeight) {
    const lowered = Math.floor(vdt.rect.height / mmPx + 1e-6);
    if (lowered * mmPx < dimensionToPx(frame.minHeight, c.dpi, c.emPx) - 0.5 && fits(c.patched(fit, name, { minHeight: mmDim(lowered) }))) {
      out.push({ kind: 'lowerMin', path: path('minHeight'), value: mmDim(lowered), frame: name });
    }
  }

  // Continue on the next page (#859 lays it out).
  if (holds && !frame.overflow.continueIn) out.push({ kind: 'continueNextPage', path: path('overflow/continueIn'), value: 'next-page' });

  // Another template of the book with a frame of this name, where the
  // page fits once set with it: its stories regrouped for it and its own
  // ladder run (#937).
  for (const alt of c.alternatives?.() ?? []) {
    if (!c.budgetLeft() || !c.fitsWithTemplate) break;
    if (!alt.frames.some((f) => f.name === name)) continue;
    if (c.fitsWithTemplate(alt)) {
      out.push({ kind: 'useTemplate', value: alt.id, ...(c.templateSource ?? {}) });
      break;
    }
  }

  // Shorter text: the lines that do not fit, at the frame's characters a
  // line.
  const lines = cur.blocks.filter((b) => vdt.blockIds.includes(b.id) && b.type !== 'resource').flatMap((b) => b.lines.filter((l) => l.text.length > 0));
  if (lines.length > 0) {
    // Characters of a full line: the lines that do not end their paragraph.
    const full = lines.filter((l) => !l.isLastLine);
    const sample = full.length > 0 ? full : lines;
    const perLine = sample.reduce((n, l) => n + l.text.length, 0) / sample.length;
    const lineH = (lines.reduce((h, l) => h + l.bbox.height, 0) / lines.length) * vdt.scale;
    if (lineH > 0) {
      const over = Math.ceil(vdt.overflowPx / lineH - 1e-6);
      out.push({ kind: 'shortenText', value: Math.ceil(over * perLine), ...(vdt.sourceStart !== undefined ? { sourceStart: vdt.sourceStart, sourceEnd: vdt.sourceEnd! } : {}) });
    }
  }
  return out;
}
