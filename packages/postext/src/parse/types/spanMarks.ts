// What a span can belong to: a direction isolate, a side line, kunten,
// emphasis dots, ruby, warichu, an exercise slot, a swatch or a chip
// (#1276: split out of types.ts).
import type { Dimension } from '../../types.js';
import type { DirectiveAttrs } from './contentBlock.js';
import type { InlineSpan } from './inlineSpan.js';

/** The directional isolate a span belongs to (see
 *  {@link InlineSpan.direction}). */
export interface InlineDirection {
  /** The isolate's direction: `rtl` from `:rtl[…]`, `ltr` from `:ltr[…]`. */
  dir: 'ltr' | 'rtl';
  /** Tells isolates apart: two isolates side by side are two runs. Ids
   *  count from 1 in each parse of a text. */
  id: number;
  /** The language of the isolate's text as written (`{lang=en}`), a BCP 47
   *  tag; unset when the directive names none. Renderers may declare it
   *  (HTML `lang`, PDF `/Lang`). */
  lang?: string;
  /** The isolate this one is nested in. */
  outer?: InlineDirection;
}

/** The side line a span belongs to (see {@link InlineSpan.sideline}). */
export interface InlineSideline {
  /** Tells lines apart: two lines set side by side are two runs. Ids
   *  count from 1 in each parse of a text. */
  id: number;
  /** `solid` (default) a rule, `double` two rules (二重傍線), `wavy` a
   *  wave (波線), `dotted` a row of dots. */
  style?: 'solid' | 'double' | 'wavy' | 'dotted';
  /** `under` or `over` the text in its flow (in vertical text over is the
   *  right side, under the left). Unset: under in horizontal text, over
   *  (right) in vertical text, where Japanese books set 傍線. */
  position?: 'over' | 'under';
}

/** The kanbun reading marks of a character (see {@link InlineSpan.kunten}). */
export interface InlineKunten {
  /** Tells directives apart. Ids count from 1 in each parse of a text. */
  id: number;
  /** The 返り点 as written (`kaeri`): レ, 一 二 三 四, 上 中 下, 甲 乙 丙
   *  丁, 天 地 人, or one of them with レ (一レ, 上レ, 甲レ, 天レ). The
   *  kanbun code points (㆑ ㆒ … ㆟, U+3191–319F) read as the characters
   *  they stand for. Unset: none. */
  kaeri?: string;
  /** The 送り仮名 (`okuri`), small kana right of the character in vertical
   *  text, over it in horizontal text. Unset: none. */
  okuri?: string;
  /** A 竪点 (`tate`): the character is read with the next one as one word,
   *  and a short rule joins them (JIS X 4051 §5.7). */
  tate?: true;
  /** Resolved by the layout before measuring (`cjk.kunten`): the marks'
   *  font (CSS shorthand at their size), colour (hex; unset: the text's)
   *  and where the 返り点 go. */
  fontString?: string;
  color?: string;
  placement?: 'inline' | 'interlinear';
}

/** An emphasis-dot mark: its shape, whether it is filled, and its side. */
export interface EmphasisMark {
  /** `dot` (default) ●, `circle` ○ (open), `sesame` ﹅. */
  style?: 'dot' | 'circle' | 'sesame';
  /** `filled` (default for `dot` and `sesame`) or `open` (default for
   *  `circle`). Unset fields take `cjk.emphasisMark`'s (in Japan the
   *  sesame). */
  fill?: 'filled' | 'open';
  /** `under` or `over` the text in its flow (in vertical text over is the
   *  right side, under the left). Unset: `cjk.emphasisMark.position`,
   *  which in Japan is over; else under in horizontal text, over (right)
   *  in vertical text. */
  position?: 'over' | 'under';
}

/** The ruby of one span (see {@link InlineSpan.ruby}). */
export interface InlineRuby {
  /** The reading as written (a group ruby) or this character's reading (a
   *  mono ruby). */
  text: string;
  /** One reading centred over the whole base, which never breaks. */
  group?: boolean;
  /** Where the reading goes, as written (`pos`); unset follows
   *  `cjk.ruby.position`. `right` sets zhuyin beside each character. */
  position?: 'over' | 'under' | 'right';
  /** The ruby this span belongs to (the characters of a mono ruby share
   *  it). */
  id: number;
  /** Jukugo ruby (熟語ルビ, JLReq §3.3.7, #422): the per-character
   *  readings of one word. Each character keeps its reading while every
   *  reading fits its base; a reading that does not may run onto the next
   *  base of the word, and the word shares its reading as a group ruby
   *  when that is not enough. The word may break between its characters,
   *  each part laid out again. Set by `mode=jukugo`, and in a Japanese
   *  document (`japan` region) on any per-character ruby of two
   *  characters or more that does not say `mode=mono`. */
  jukugo?: true;
  /** `mode=mono` was written: the readings stay per character (モノルビ)
   *  in a Japanese document too. */
  mono?: true;
  /** `align=` as written: where a reading shorter than its base sits
   *  (`center`, `jis` 1:2:1, `start`); unset follows `cjk.ruby.align`. */
  align?: 'center' | 'jis' | 'start';
  /** Resolved by the layout before measuring (`cjk.ruby.overhang`, set
   *  only when it is not the clreq quarter em): what a longer reading may
   *  run onto. */
  overhang?: 'none' | 'kana' | 'any';
  /** Resolved by the layout (`cjk.ruby.smallKana: 'full'`): the reading's
   *  small kana are painted full size (がつこう for がっこう). */
  fullKana?: true;
  /** Resolved by the layout before measuring: the reading's font (CSS
   *  shorthand at the ruby size) and colour (hex; unset: the text's). */
  fontString?: string;
  color?: string;
}

/** The warichu note a span is part of (see {@link InlineSpan.warichu}). */
export interface InlineWarichu {
  id: number;
  /** Brackets for this note as written (`open` / `close`); unset follow
   *  `cjk.warichu`. */
  open?: string;
  close?: string;
  /** Resolved by the layout before measuring: the note's font at the note
   *  size (CSS shorthand) and colour (hex; unset: the text's). */
  fontString?: string;
  color?: string;
}

/** The attributes of a `:swatch{…}` beside its colour (#1104), as
 *  written: lengths as `Dimension`s (em of the text the swatch sits in), the
 *  outline colour as a hex or a palette id. */
export interface SwatchShape {
  /** Side of the square. Default 0.75 em (a capital's height). */
  size?: Dimension;
  /** Width of the outline; 0 draws none. Default 6 % of the side (at
   *  least half a pixel). */
  borderWidth?: Dimension;
  /** Colour of the outline. Default the text's. */
  borderColor?: string;
  /** Corner radius, clamped to half the side. Default square corners. */
  radius?: Dimension;
  /** Room after the square, between it and the words that follow (its
   *  label), part of the swatch's advance. Default none. */
  gap?: Dimension;
}

/** An element of an exercise the digital outputs answer through (#1230):
 *  the exercise's id and the slot's key. */
export interface ExerciseHit {
  ex: number;
  slot: string;
}

/** An answer written into an exercise's text (`[[…]]`, #1225): accepted
 *  answers (`[[colour | color]]`) or an inline choice (`[[go | (goes)]]`,
 *  `choice`, the options in parentheses right). */
export interface ExerciseGap {
  /** Each option's inline Markdown, parentheses of a right one taken off. */
  options: InlineSpan[][];
  /** Each option's plain text. */
  texts: string[];
  /** The right options' indexes: every option when not a choice. */
  correct: number[];
  choice: boolean;
  /** The attributes right after the gap (`[[went]]{width=6}`). */
  attrs?: DirectiveAttrs;
}

/** A {@link SwatchShape} resolved for one swatch: lengths in px, the
 *  outline colour as hex. Only the fields the swatch sets. */
export interface SwatchBox {
  sidePx?: number;
  borderWidthPx?: number;
  borderColor?: string;
  radiusPx?: number;
  gapPx?: number;
}

/** A chip style resolved for one chip in its context: lengths in px (em
 *  read against the chip's font size), colours as hex. */
export interface ChipBox {
  styleId: string;
  /** Unset: the surrounding text's family. */
  fontFamily?: string;
  fontSizePx: number;
  bold: boolean;
  italic: boolean;
  /** Unset: the surrounding text colour. */
  color?: string;
  background?: string;
  /** Unset when the outline is not drawn (zero width). */
  borderColor?: string;
  borderWidthPx: number;
  borderRadiusPx: number;
  paddingXPx: number;
  paddingYPx: number;
  /** The chip's base direction when it has one of its own: inline code
   *  reads left to right (#845). Unset: its first strong letter's. */
  direction?: 'ltr';
  /** Set only when the style sets its own (`paddingTop`); `paddingYPx`
   *  otherwise. */
  paddingTopPx?: number;
  /** Set only when the style sets its own (`paddingBottom`); `paddingYPx`
   *  otherwise. */
  paddingBottomPx?: number;
  gapPx: number;
  /** Letters painted as dots to trace (the style's `dotted`), px. */
  dotted?: { spacingPx: number; sizePx: number };
  /** The outline drawn as a line under the text (the style's `underline`). */
  underline?: 'solid' | 'dotted' | 'dashed';
  /** The narrowest the box is (the style's `minWidth`), px. */
  minWidthPx?: number;
}
