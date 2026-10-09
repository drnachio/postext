/**
 * Drop caps in body paragraphs (#623): reading the settings a paragraph
 * style or a heading level (or style) carries, and the `{dropcap}`
 * attribute of a `:::paragraphs` fence or a heading line. Settings are
 * kept as written (`resolve*` passes them through); the layout reads them
 * through {@link readDropCap}, which fills the defaults and drops values
 * it cannot use (`collectConfigWarnings` names them).
 */

import type { Dimension, DropCapPunctuation, DropCapShortParagraph, ParagraphDropCap } from '../types';

export const DROP_CAP_PUNCTUATION: readonly DropCapPunctuation[] = ['with-cap', 'hang', 'text'];
export const DROP_CAP_SHORT_PARAGRAPH: readonly DropCapShortParagraph[] = ['reserve', 'shrink', 'skip'];

/** The default number of lines a drop cap spans and sinks. */
export const DEFAULT_DROP_CAP_LINES = 3;
/** The default space between the initial and the text, in em of the text. */
export const DEFAULT_DROP_CAP_GAP: Dimension = { value: 0.15, unit: 'em' };

/** A drop cap's settings with the defaults filled in (see
 *  {@link ParagraphDropCap}). */
export interface DropCapSettings {
  lines: number;
  sink: number;
  characters: number;
  fontFamily?: string;
  fontWeight?: number;
  italic: boolean;
  fontSize?: Dimension;
  color?: ParagraphDropCap['color'];
  gap: Dimension;
  punctuation: DropCapPunctuation;
  leadIn?: { words: number | 'line'; smallCaps: boolean; uppercase: boolean };
  shortParagraph: DropCapShortParagraph;
  each: boolean;
}

const wholeAtLeast = (value: unknown, min: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.round(value) : undefined;

/** A drop cap setting as the config writes it: an object (a heading
 *  style's `false` and anything else read as none). */
export function isDropCap(value: unknown): value is ParagraphDropCap {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** `cap` with the defaults filled in; `lines` replaces its lines (a
 *  `{dropcap=N}` attribute), and its sink with them unless the setting
 *  raises the initial (a sink under its lines keeps the difference). */
export function readDropCap(cap: ParagraphDropCap, lines?: number): DropCapSettings {
  const ownLines = wholeAtLeast(cap.lines, 1) ?? DEFAULT_DROP_CAP_LINES;
  const ownSink = wholeAtLeast(cap.sink, 1);
  const n = lines ?? ownLines;
  const raised = ownSink !== undefined && ownSink < ownLines ? ownLines - ownSink : 0;
  const sink = Math.max(1, Math.min(n, lines !== undefined ? n - raised : ownSink ?? n));
  const leadIn = cap.leadIn && typeof cap.leadIn === 'object' ? cap.leadIn : undefined;
  const words = leadIn?.words === 'line' ? 'line' : wholeAtLeast(leadIn?.words, 1);
  return {
    lines: n,
    sink,
    characters: wholeAtLeast(cap.characters, 1) ?? 1,
    ...(typeof cap.fontFamily === 'string' && cap.fontFamily.trim() !== '' ? { fontFamily: cap.fontFamily } : {}),
    ...(typeof cap.fontWeight === 'number' && Number.isFinite(cap.fontWeight) ? { fontWeight: cap.fontWeight } : {}),
    italic: cap.italic === true,
    ...(cap.fontSize && typeof cap.fontSize.value === 'number' && cap.fontSize.value > 0 ? { fontSize: cap.fontSize } : {}),
    ...(cap.color && typeof cap.color.hex === 'string' ? { color: cap.color } : {}),
    gap: cap.gap && typeof cap.gap.value === 'number' ? cap.gap : DEFAULT_DROP_CAP_GAP,
    punctuation: (DROP_CAP_PUNCTUATION as readonly string[]).includes(cap.punctuation as string) ? cap.punctuation! : 'with-cap',
    ...(words !== undefined
      ? { leadIn: { words, uppercase: leadIn?.uppercase === true, smallCaps: leadIn?.smallCaps ?? leadIn?.uppercase !== true } }
      : {}),
    shortParagraph: (DROP_CAP_SHORT_PARAGRAPH as readonly string[]).includes(cap.shortParagraph as string) ? cap.shortParagraph! : 'reserve',
    each: cap.each === true,
  };
}

/** What a `{dropcap}` attribute says (on a `:::paragraphs` fence or a
 *  heading line): `'off'` for `false`, `no` or `0`; a number of lines for
 *  `{dropcap=N}`; `'on'` for the bare flag or `true`; undefined when it is
 *  absent (or reads as nothing). */
export function dropCapAttr(attrs: Readonly<Record<string, string>> | undefined): 'on' | 'off' | number | undefined {
  const raw = attrs?.dropcap ?? attrs?.dropCap;
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '' || v === 'true' || v === 'yes' || v === 'on') return 'on';
  if (v === 'false' || v === 'no' || v === 'off' || v === '0' || v === 'none') return 'off';
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : undefined;
}
