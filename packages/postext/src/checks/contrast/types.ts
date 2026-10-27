// Types of the contrast check: media, roles, pairs, issues and options.
import type { ContrastLevel, ResolvedContrastConfig } from '../../types.js';
import type { BoundingBox } from '../../vdt.js';
import type { OutputTransform } from '../../color/transform.js';

export type ContrastMedium = 'screen' | 'print';

/** What a piece of text is, for a host that words its findings. */
export type ContrastRole = 'body' | 'heading' | 'caption' | 'table' | 'runningHead' | 'design' | 'chip' | 'marker' | 'label';

/** Why reversed text is reported: under the size for any face, or under
 *  the size for thin strokes while italic or light. */
export type ReversedTextReason = 'small' | 'italic' | 'light';

/** One text and ground combination the document sets, at one size and
 *  weight, whether it passes or not. */
export interface ContrastPair {
  /** The text colour as painted (`#rrggbb`, a translucent one blended
   *  with its ground). */
  color: string;
  /** The ground as painted (`#rrggbb`). */
  background: string;
  /** The same two as the configuration writes them (lower case, alpha
   *  kept): what a colour field holds. */
  textColor: string;
  groundColor: string;
  sizePt: number;
  weight: number;
  italic: boolean;
  /** Large text (18 pt, or 14 pt bold): the lower threshold applies. */
  large: boolean;
  role: ContrastRole;
  /** How many runs of text are set so. */
  count: number;
  /** Where the first one is: book-absolute page index, its box on the
   *  sheet (page px) and its source range when it has one. */
  pageIndex: number;
  rect: BoundingBox;
  sourceStart?: number;
  sourceEnd?: number;
  /** The first run's text, cut to 40 characters. */
  text: string;
  /** The ratio the level asks of this size and weight. */
  required: number;
  /** The WCAG ratio of the sRGB colours. */
  screen: number;
  /** The ratio on paper; present when the output transform was given. */
  print?: number;
  /** Set when the text is knocked out of an inked ground and is under the
   *  sizes of `contrast.reversedText`. `inks`: how many of the four the
   *  ground is built of. */
  reversed?: { reasons: ReversedTextReason[]; minimumPt: number; inks: number };
  /** The styles the text is set in, innermost first (a chip style, a
   *  label style, a paragraph or heading style, the box styles round it):
   *  set only while `contrast.allow` names a style, the pairs then kept
   *  apart by them. */
  styles?: string[];
}

/** Why a finding is accepted: the `contrast.allow` entry it matches. */
export interface ContrastAccepted {
  reason: string;
  fg?: string;
  bg?: string;
  style?: string;
}

export type ContrastIssue = {
  /** Book-absolute page index of the first occurrence. */
  pageIndex: number;
  rect: BoundingBox;
  sourceStart?: number;
  sourceEnd?: number;
  color: string;
  background: string;
  /** The smallest size the pair is set at, and that run's weight. */
  sizePt: number;
  weight: number;
  italic: boolean;
  role: ContrastRole;
  text: string;
  /** Runs of text set so, over every size sharing the finding. */
  count: number;
  /** The pair is one `contrast.allow` accepts (#1124): listed, not a
   *  warning. */
  accepted?: ContrastAccepted;
} & (
  | {
      kind: 'lowContrast';
      level: ContrastLevel;
      large: boolean;
      required: number;
      /** The ratio in each rendition checked. */
      screen?: number;
      print?: number;
      /** The renditions under `required`. */
      failing: ContrastMedium[];
    }
  | { kind: 'reversedText'; reasons: ReversedTextReason[]; minimumPt: number; inks: number }
);

export type ContrastKind = ContrastIssue['kind'];

export interface ContrastOptions {
  /** The settings to check against; the document's `config.contrast`
   *  (else the defaults) when omitted. */
  contrast?: ResolvedContrastConfig;
  /** The renditions to check, whatever `contrast.mode` says. */
  media?: readonly ContrastMedium[];
  /** The separation of the job's output profile: gives the print ratio
   *  and counts the inks of a ground. */
  transform?: OutputTransform;
  /** `contrastPairs(doc, …)` under the same settings and transform, when
   *  the host already has them: `contrastDocument` then skips the walk. */
  pairs?: readonly ContrastPair[];
}
