/**
 * The source of a comic page as the block parser reads it (`:::page`,
 * #555): its attributes, its split, its panels and their script lines,
 * every part with its source range so the Sandbox can map a click on a
 * panel or a balloon back to the text and write a dragged splitter or
 * balloon back into it.
 *
 * Offsets are absolute in the Markdown given to the parser (the body after
 * the frontmatter, as every `ContentBlock` offset is).
 */

import type { DirectiveAttrs, InlineSpan } from '../parse/types';
import type { ComicBalloonPosition } from '../types';
import type { ComicSplitParse } from './split';

/** A source range. */
export interface ComicSourceRange {
  start: number;
  end: number;
}

/** What a script line is: a speaker's balloon, or one of the reserved keys
 *  (`caption`: a narration box, `sfx`: a sound effect with no balloon,
 *  `note`: an editor's note). */
export type ComicScriptRole = 'speech' | 'caption' | 'sfx' | 'note';

/** The keys a script line may not use as a speaker id. */
export const COMIC_RESERVED_KEYS: ReadonlySet<string> = new Set(['caption', 'sfx', 'note']);

/** Where a balloon's tail goes when its speaker is off the panel. */
export type ComicTailSide = 'top' | 'bottom' | 'start' | 'end';

/** One balloon of a panel's script (`ana{whisper at="40% 20%"}: Hello`),
 *  with its continuation lines. */
export interface ComicScriptItem {
  /** The key as written (`ana`, `caption`). */
  key: string;
  role: ComicScriptRole;
  /** The speaker id (the key of a `speech` line). */
  speaker?: string;
  /** The balloon style the line names (a bare flag such as `{whisper}`,
   *  or `style=…`), unchecked. Unset: the default of its role or of its
   *  speaker's cast entry. */
  style?: string;
  /** Every bare flag that names a style (more than one is an authoring
   *  slip; the first wins). */
  styleFlags: string[];
  /** `at="x% y%"`: the balloon's centre, in fractions of the panel's
   *  picture (of the cell, for a panel without one). */
  at?: { x: number; y: number };
  /** `at=top-start` and the like: a corner or edge of the panel. */
  atKeyword?: Exclude<ComicBalloonPosition, 'auto'>;
  /** `to="x% y%"`: where the tail points, in fractions of the picture. */
  to?: { x: number; y: number };
  /** `tail=none|auto|top|bottom|start|end`. */
  tail?: 'none' | 'auto' | ComicTailSide;
  /** `join` / `join=false`: force or forbid joining with the speaker's
   *  previous balloon. */
  join?: boolean;
  /** `break`: the balloon may cross the panel border. */
  break?: boolean;
  /** Sound effects: rotation (degrees), size (a multiple of the lettering
   *  size), colour and face. */
  rotate?: number;
  size?: number;
  color?: string;
  font?: string;
  /** The attributes as written. */
  attrs: DirectiveAttrs;
  /** Where each attribute's value sits (absolute), for a write-back. */
  attrSources: Record<string, ComicSourceRange>;
  /** The text, read as inline Markdown (emphasis, ruby, tcy, `:ltr`…).
   *  Spaces are collapsed; a forced line break (a backslash ending a line,
   *  or `\\`) is `BREAK_PLACEHOLDER` (U+2028). */
  text: string;
  spans: InlineSpan[];
  /** `sourceMap[i]`: the absolute source offset of `text[i]`. */
  sourceMap: number[];
  /** The whole line, continuation lines included. */
  sourceStart: number;
  sourceEnd: number;
  /** The key. */
  keyStart: number;
  keyEnd: number;
  /** Inside the `{…}` of the key, when it has one. */
  attrsStart?: number;
  attrsEnd?: number;
  /** The text after the colon, continuation lines included. */
  textStart: number;
  textEnd: number;
  /** A line that is not a script line (no `key:`), or text before the
   *  first panel: lettered as a caption (`comicStrayText`). */
  stray?: true;
}

/** One `::panel{…}` of a comic page and its script. */
export interface ComicPanelSource {
  /** Position in the page (0-based), the reading order of the cells. */
  index: number;
  attrs: DirectiveAttrs;
  /** Where each attribute's value sits (absolute). */
  attrSources: Record<string, ComicSourceRange>;
  /** From the `::panel` line to the end of its last script line. */
  sourceStart: number;
  sourceEnd: number;
  /** The `::panel` line. */
  lineStart: number;
  lineEnd: number;
  /** No `::panel` line: the panel holds text written before the first one
   *  in a page that has none. */
  implicit?: true;
  items: ComicScriptItem[];
}

/** A comic page or strip as written. */
export interface ComicPageSource {
  /** The fence that opened it: `:::page` (a page of its own, or two for a
   *  spread) or `:::strip` (a block in the text flow, #566). */
  kind: 'page' | 'strip';
  /** The fence's attributes as written. */
  attrs: DirectiveAttrs;
  /** Where each fence attribute's value sits (absolute). */
  attrSources: Record<string, ComicSourceRange>;
  /** Inside the fence's `{…}`, when it has one; else an empty range right
   *  after the fence name (where an attribute block would be inserted). */
  attrsStart: number;
  attrsEnd: number;
  /** The `split` value as written and parsed; its range is
   *  `attrSources.split`. Unset when the fence has no `split`: the panels
   *  of a page then stack in equal tiers, those of a strip sit side by
   *  side. */
  split?: string;
  splitParse: ComicSplitParse;
  panels: ComicPanelSource[];
  /** Ranges of the text written before the first `::panel` line. */
  stray: ComicSourceRange[];
  /** The closing `:::` was found (an unclosed page runs to the end). */
  closed: boolean;
  sourceStart: number;
  sourceEnd: number;
}
