// Content warnings of composed pages: frames that overflow, cover one
// another, run past what holds them or go on to other pages.
import type { FrameFitStep, FrameOverflowProposal, FrameCoverProposal, FrameOutsideProposal } from '../warnings.js';

/** Members of `ContentWarning` (`../contentWarnings.ts`). */
export type ComposedPageWarning =
  /** The content poured into a frame of a composed page does not fit it
   *  (#855): the frame has no `next` frame left to go on in, or no more
   *  room in its chain. What does not fit is clipped at the frame's foot
   *  on paged output; it stays in the document (reflowable output, the
   *  source map, this warning). `overflowMm` is the height that is cut.
   *  Provisional: #858 adds the steps tried and the fixes. */
  | {
    kind: 'frameOverflow';
    template: string;
    frame: string;
    fenceIndex: number;
    overflowMm: number;
    configPath: string;
    /** The document's locale (`config.locale`): the same page overflows in
     *  one language and fits in another. */
    locale?: string;
    /** The steps of the reflow ladder (#858) that applied to the frame, in
     *  the order they were tried; none made the content fit. */
    stepsTried: FrameFitStep[];
    /** The text scale the frame was left at (1 = none). */
    scale: number;
    /** The scale its pictures were left at, below 1. */
    imageScale?: number;
    /** Changes that would make the content fit, with their values worked
     *  out from the shortfall (each tried on the page where it can be). */
    proposals: FrameOverflowProposal[];
  }
  /** Ink of a frame lies under another frame painted over it (#1053): a
   *  later `layer`, or the same layer later in template order. A frame
   *  covers where it is opaque: its fill (the callout style's background,
   *  `look.background`, a label tab, a stripe), its pictures and its text;
   *  a frame with no fill covers nothing between its pictures and lines. What
   *  is covered: the frame's lines (their boxes), its tab and title, its
   *  pictures (by a fill or a picture: words over a picture hide a hairline
   *  of it). `text` is the first words covered (40 characters), `picture`
   *  the resource id of the first picture covered, `overlapMm2` the area
   *  covered. One warning per pair of frames; `overlap: 'allow'` on either
   *  frame leaves the pair out. The source range is the covered frame's
   *  content. */
  | {
    kind: 'frameCovered';
    template: string;
    frame: string;
    coveredBy: string;
    fenceIndex: number;
    configPath: string;
    /** The covering frame's config path. */
    coveredByPath: string;
    overlapMm2: number;
    text?: string;
    picture?: string;
    locale?: string;
    proposals: FrameCoverProposal[];
  }
  /** A frame's ink runs past what holds it (#1053): its text past the trim,
   *  its fill or pictures past the bleed (`past: 'trim' | 'bleed'`), or
   *  any of it past the frame or group it is anchored inside (a nine-point
   *  anchor on `'#name'` whose point lies in that box: `past: 'frame' |
   *  'group'`, `target` its name). What runs past is cut at the trim, and
   *  reads as escaping its card. `excessMm` is the largest overrun, `sides`
   *  each side's. `overlap: 'allow'` on the frame leaves it out. */
  | {
    kind: 'frameOutsideArea';
    template: string;
    frame: string;
    fenceIndex: number;
    configPath: string;
    past: 'trim' | 'bleed' | 'frame' | 'group';
    target?: string;
    excessMm: number;
    sides: { top?: number; right?: number; bottom?: number; left?: number };
    locale?: string;
    proposals: FrameOutsideProposal[];
  }
  /** A frame's content went on to other pages (#859) as many times as a
   *  composed page may add (`pages`, 16) and still does not fit: what is
   *  left is cut at the foot of the frame on the last page added
   *  (`overflowMm`, `pageIndex`). */
  | {
    kind: 'frameContinuationLimit';
    template: string;
    frame: string;
    fenceIndex: number;
    pages: number;
    overflowMm: number;
    configPath: string;
  }
  /** A frame's `overflow.continueIn: 'page:<id>'` (#917) names no page
   *  fence `::::page{id=…}` after the fence the story is on (`target`, its
   *  `{attr.x}` read; `before`: the fence is there, but before or at this
   *  page): the rest goes on on the next page instead. */
  | {
    kind: 'continueTargetMissing';
    template: string;
    frame: string;
    fenceIndex: number;
    target: string;
    before?: true;
    /** The story comes from the chapter at this position of the book and
     *  this chapter has no composed page with that `id` (#943): the rest is
     *  not set; `fenceIndex` is -1. */
    fromChapter?: number;
    configPath: string;
  }
  /** A composed page's fence and its template disagree about spreads
   *  (#861): `::::page{template spread}` names a template that is a single
   *  page (`fence: true`, `templateSpread: false`; it is laid as one
   *  page), or the fence lacks `spread` and the template is a spread
   *  (`fence: false`, `templateSpread: true`; it is laid over two facing
   *  pages, as the template says). */
  | { kind: 'spreadMismatch'; template: string; fenceIndex: number; fence: boolean; templateSpread: boolean };
