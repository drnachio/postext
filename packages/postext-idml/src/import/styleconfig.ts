// The looks of the document as the styles of the book: the body text,
// the heading levels, named paragraph styles, lists and quotations.
//
// Postext separates content from form: the Markdown says what a block is
// (`## A heading`, a list item, a `:::paragraphs{style="…"}` group) and
// the configuration says how it looks. So every look gets a place in the
// configuration here, before any text is written, and the text only
// names it.

import type { ColorValue, HeadingLevelConfig, HeadingStyleConfig, ParagraphStyleConfig, PostextConfig, TabStop as PostextTabStop } from 'postext';
import { paragraphProps } from '../resolve/styles.js';
import type { Context } from './context.js';
import { idOf } from './escape.js';
import type { Look } from './looks.js';
import { BLACK, pt } from './values.js';

const em = (thousandths: number): { value: number; unit: 'em' } => ({ value: Math.round(thousandths) / 1000, unit: 'em' });

function colourOf(ctx: Context, l: Look): ColorValue {
  return ctx.palette.colour(l.cf.fillColor, l.cf.fillTint, l.path) ?? BLACK;
}

const TAB_ALIGN: Record<string, PostextTabStop['align']> = { LeftAlign: 'start', CenterAlign: 'center', RightAlign: 'end', CharacterAlign: 'decimal' };

/** A look's tab stops. InDesign measures a stop from the frame's text
 *  edge, Postext from the start of the paragraph's measure, past the
 *  style's indent: `origin` is that indent (0 where it is not carried, as
 *  for the body text), taken off every stop. Without it a key set in
 *  columns from an indent came back one indent too far right (#1555). */
function tabStops(l: Look, origin = 0): PostextTabStop[] | undefined {
  if (!l.pf.tabs.length) return undefined;
  const stops = l.pf.tabs.map((t) => {
    const stop: PostextTabStop = { position: pt(Math.max(0, t.position - origin)), align: TAB_ALIGN[t.alignment] ?? 'start' };
    const leader = t.leader.trim() ? t.leader : '';
    if (leader) stop.leader = leader;
    if (t.alignment === 'CharacterAlign' && t.alignmentCharacter && t.alignmentCharacter !== '.') stop.decimalChar = t.alignmentCharacter;
    return stop;
  });
  // In InDesign the left indent of a paragraph whose first line hangs
  // out is a tab stop too: the tab after the label of a list or contents
  // row goes there. Postext has no such stop of its own.
  const left = l.pf.leftIndent;
  if (l.pf.firstLineIndent < 0 && left > 0 && !l.pf.tabs.some((t) => t.position <= left + 0.5 && t.position > left + l.pf.firstLineIndent)) {
    stops.push({ position: pt(Math.max(0, left - origin)), align: 'start' });
    const at = (stop: PostextTabStop): number => (typeof stop.position === 'object' && 'value' in stop.position ? stop.position.value : Infinity);
    stops.sort((a, b) => at(a) - at(b));
  }
  return stops;
}

/** What Postext's styles cannot say of a look, counted by style. */
function reportLook(ctx: Context, l: Look): void {
  const at = `${l.path}: ${l.sample}`;
  if (l.pf.ruleAbove || l.pf.ruleBelow) ctx.rep.add('paragraphRules', 'loss', 'Paragraph rules (a line above or below a paragraph) are not drawn: the paragraph is set without them, at the same place (Postext paragraph styles have no rules)', at, l.paragraphs);
  if (l.pf.shading) ctx.rep.add('paragraphShading', 'loss', 'Paragraph shading is not drawn: the paragraph is set on the page\'s own ground (Postext shades boxes, not paragraphs)', at, l.paragraphs);
  if (l.pf.border) ctx.rep.add('paragraphBorder', 'loss', 'Paragraph borders are not drawn: the paragraph is set without a frame about it', at, l.paragraphs);
  if (l.pf.spanColumns && l.role !== 'heading') ctx.rep.add('spanColumns', 'warning', 'A paragraph that spans the columns of its frame is set in its column (only headings span in Postext)', at, l.paragraphs);
  if (l.pf.lastLineIndent) ctx.rep.add('lastLineIndent', 'info', 'A last-line indent is not carried', at, l.paragraphs);
  if (l.cf.horizontalScale !== 100 || l.cf.verticalScale !== 100) ctx.rep.add('glyphScaling', 'warning', 'Horizontally or vertically scaled characters are set at their natural width', at, l.paragraphs);
  if (l.cf.openType.length) ctx.rep.add('openTypeFeatures', 'info', 'OpenType features switched on in InDesign (figures, ligature sets, alternates) are left to the font\'s defaults', `${l.path}: ${l.cf.openType.join(', ')}`);
  if (l.pf.justification === 'ToBindingSide' || l.pf.justification === 'AwayFromBindingSide') ctx.rep.add('alignToSpine', 'warning', 'Text aligned towards or away from the spine is set flush left', at, l.paragraphs);
  if (l.pf.justification === 'CenterJustified' || l.pf.justification === 'RightJustified' || l.pf.justification === 'FullyJustified') ctx.rep.add('lastLineAlignment', 'info', 'Justified text whose last line is centred, flush right or spread is justified with its last line flush left', at, l.paragraphs);
}

/** The space above a paragraph of the look. InDesign adds a paragraph's
 *  space before to the space after of the one above it, where Postext
 *  takes the larger of the two. A look with no space before leaves the gap
 *  to the paragraph above (its space after is that paragraph's margin, so
 *  the larger of the two is the sum). A look with space of its own takes
 *  the sum it most often stood under, so its usual pair keeps its gap. */
function spaceAbove(l: Look): number {
  if (!(l.pf.spaceBefore > 0)) return Math.max(0, l.pf.spaceBefore);
  let best = l.pf.spaceBefore;
  let most = 0;
  for (const [gap, n] of l.gaps ?? []) {
    if (n > most || (n === most && gap > best)) {
      most = n;
      best = gap;
    }
  }
  return Math.max(best, l.pf.spaceBefore);
}

function paragraphStyle(ctx: Context, l: Look, id: string, body: Look | undefined): ParagraphStyleConfig {
  const s: ParagraphStyleConfig = {
    id,
    name: l.path,
    fontSize: pt(l.cf.pointSize),
    lineHeight: pt(l.cf.leading),
    textAlign: l.pf.align,
    fontWeight: l.weight,
    italic: l.italic,
    hyphenation: l.pf.hyphenation,
    color: colourOf(ctx, l),
    // InDesign's bold and italic words keep their paragraph's colour (a
    // coloured word is a mark of its own); Postext's would take the
    // palette's main colour (#1555).
    boldColor: colourOf(ctx, l),
    italicColor: colourOf(ctx, l),
    indent: pt(Math.max(0, l.pf.leftIndent + Math.min(0, l.pf.firstLineIndent))),
    endIndent: pt(l.pf.rightIndent),
    firstLineIndent: pt(Math.max(0, l.pf.firstLineIndent)),
    hangingIndent: pt(Math.max(0, -l.pf.firstLineIndent)),
    // Each paragraph of a spaced look is a group of its own (`blocks.ts`):
    // the margins say all of its space.
    spaceBetween: pt(0),
    marginTop: pt(spaceAbove(l)),
    marginBottom: pt(l.pf.spaceAfter),
    snapToGrid: false,
  };
  if (l.cf.fontFamily && l.cf.fontFamily !== body?.cf.fontFamily) s.fontFamily = l.cf.fontFamily;
  if (l.cf.capitalization === 'AllCaps') s.textTransform = 'uppercase';
  if (l.cf.capitalization === 'SmallCaps' || l.cf.capitalization === 'CapToSmallCap') s.smallCaps = true;
  if (l.cf.tracking) s.letterSpacing = em(l.cf.tracking);
  const tabs = tabStops(l, Math.max(0, l.pf.leftIndent + Math.min(0, l.pf.firstLineIndent)));
  if (tabs) s.tabStops = tabs;
  if (l.pf.dropCap) s.dropCap = { lines: l.pf.dropCap.lines, characters: l.pf.dropCap.characters, each: true };
  return s;
}

function headingFields(ctx: Context, l: Look): Omit<HeadingLevelConfig, 'level'> {
  const h: Omit<HeadingLevelConfig, 'level'> = {
    fontSize: pt(l.cf.pointSize),
    lineHeight: pt(l.cf.leading),
    color: colourOf(ctx, l),
    fontWeight: l.weight,
    italic: l.italic,
    marginTop: pt(spaceAbove(l)),
    marginBottom: pt(l.pf.spaceAfter),
    numberingTemplate: '',
    snapToGrid: false,
    textTransform: l.cf.capitalization === 'AllCaps' ? 'uppercase' : 'none',
    letterSpacing: em(l.cf.tracking),
    breakBefore: breakOf(l),
  };
  if (l.cf.fontFamily) h.fontFamily = l.cf.fontFamily;
  if (l.pf.spanColumns) h.span = 'page';
  if (l.pf.leftIndent) h.indent = pt(l.pf.leftIndent);
  return h;
}

function breakOf(l: Look): NonNullable<HeadingLevelConfig['breakBefore']> {
  switch (l.pf.startParagraph) {
    case 'NextPage':
      return { enabled: true, parity: 'any' };
    case 'NextOddPage':
      return { enabled: true, parity: 'odd' };
    case 'NextEvenPage':
      return { enabled: true, parity: 'even' };
    default:
      return { enabled: false };
  }
}

const NUMBER_FORMATS: [RegExp, string][] = [
  [/^1,/, 'arabic'],
  [/^01,/, 'arabic'],
  [/^I,/, 'upper-roman'],
  [/^i,/, 'lower-roman'],
  [/^A,/, 'upper-alpha'],
  [/^a,/, 'lower-alpha'],
];

/** Styles of the book from the looks. Gives every look that needs one
 *  its id, and writes how each paragraph style was read to the report. */
export function styleConfig(ctx: Context): Pick<PostextConfig, 'bodyText' | 'headings' | 'headingStyles' | 'paragraphStyles' | 'unorderedLists' | 'orderedLists'> {
  const looks = [...ctx.looks.all.values()].filter((l) => l.paragraphs > 0).sort((a, b) => b.characters - a.characters);
  const body = ctx.looks.body;
  const out: ReturnType<typeof styleConfig> = {};

  if (body) {
    const raw = paragraphProps(ctx.doc, body.first);
    const n = (name: string): number | undefined => (raw.attrs[name] !== undefined && Number.isFinite(Number(raw.attrs[name])) ? Number(raw.attrs[name]) : undefined);
    out.bodyText = {
      fontSize: pt(body.cf.pointSize),
      lineHeight: pt(body.cf.leading),
      textAlign: body.pf.align,
      fontWeight: body.weight,
      color: colourOf(ctx, body),
      // Bold and italic words in the body's colour, as InDesign sets them
      // (Postext's default is the palette's main colour, #1555).
      boldColor: colourOf(ctx, body),
      italicColor: colourOf(ctx, body),
      firstLineIndent: pt(Math.max(0, body.pf.firstLineIndent)),
      paragraphSpacing: body.pf.spaceBefore + body.pf.spaceAfter > 0 ? pt(body.pf.spaceBefore + body.pf.spaceAfter) : false,
      hyphenation: { enabled: body.pf.hyphenation },
    };
    if (body.cf.fontFamily) out.bodyText.fontFamily = body.cf.fontFamily;
    const min = n('MinimumWordSpacing');
    const max = n('MaximumWordSpacing');
    const desired = n('DesiredWordSpacing') ?? 100;
    // Only limits a compositor would set: InDesign's range is 0-1000 %.
    if (min !== undefined && desired > 0 && min / desired >= 0.5 && min <= desired) out.bodyText.minWordSpacing = Math.round((min / desired) * 100) / 100;
    if (max !== undefined && desired > 0 && max >= desired && max / desired <= 3) out.bodyText.maxWordSpacing = Math.round((max / desired) * 100) / 100;
    const letter = n('MaximumLetterSpacing');
    if (letter) out.bodyText.maxJustifyTracking = Math.round(letter * 10);
    const tabs = tabStops(body);
    if (tabs) out.bodyText.tabStops = tabs;
    else out.bodyText.tabInterval = pt(36);
    const keep = body.pf.keep;
    out.bodyText.orphanMinLines = Math.max(1, keep.lastLines);
    out.bodyText.widowMinLines = Math.max(1, keep.firstLines);
    if (body.pf.leftIndent || body.pf.rightIndent) ctx.rep.add('bodyIndent', 'warning', 'The body text\'s left and right indents are not carried: Postext\'s body text fills its column', body.path);
    if (body.pf.hyphenation) {
      const ladder = n('HyphenationLadderLimit');
      if (ladder !== undefined) ctx.rep.add('hyphenationSettings', 'info', 'Hyphenation limits (word length, letters before and after, ladder) are left to Postext\'s own rules', `${body.path}: ladder ${ladder}`);
    }
  }

  // Headings: one configuration per level; other looks of a level are
  // heading styles the heading names.
  const levels = new Map<number, Look>();
  const headingStyles: HeadingStyleConfig[] = [];
  for (const l of looks) {
    if (l.role !== 'heading') continue;
    const level = l.level ?? 1;
    if (!levels.has(level)) levels.set(level, l);
    else {
      l.id = ctx.styleIds.take(idOf(l.name || `heading-${level}`, `heading-${level}`));
      headingStyles.push({ id: l.id, name: l.path, ...headingFields(ctx, l), numbered: false });
    }
  }
  if (levels.size) {
    const first = levels.get(Math.min(...levels.keys()))!;
    out.headings = { textAlign: first.pf.align, snapToGrid: false, levels: [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([level, l]) => ({ level, ...headingFields(ctx, l) })) };
    for (const [, l] of levels) if (l.pf.align !== first.pf.align) ctx.rep.add('headingAlignment', 'warning', 'Postext aligns every heading level alike; a level aligned differently takes the first level\'s alignment', `${l.path}: ${l.pf.align}`);
  }
  if (headingStyles.length) out.headingStyles = headingStyles;

  // Named paragraph styles.
  const styles: ParagraphStyleConfig[] = [];
  for (const l of looks) {
    if (l.role === 'style' || l.role === 'caption') {
      l.id = ctx.styleIds.take(idOf(l.name && !l.name.startsWith('[') && l.name !== 'NormalParagraphStyle' ? l.name : 'text', 'text'));
      styles.push(paragraphStyle(ctx, l, l.id, body));
    }
    if (l.role === 'quote' && body) {
      const quote = { color: colourOf(ctx, l), italic: l.italic, indent: pt(l.pf.leftIndent), firstLineIndent: pt(Math.max(0, l.pf.firstLineIndent)) };
      (out.bodyText ??= {}).blockquote = quote;
      if (l.cf.pointSize !== body.cf.pointSize || l.cf.fontFamily !== body.cf.fontFamily) ctx.rep.add('quoteType', 'warning', 'A quotation set in another size or typeface than the body keeps the body\'s: Postext quotations take their colour, slant and indent only', l.path);
    }
    reportLook(ctx, l);
  }
  if (styles.length) out.paragraphStyles = styles;
  // InDesign justifies the line a forced line break ends (postext 1.76,
  // `bodyText.justifyHardBreaks`): the lines the source kept read as set.
  (out.bodyText ??= {}).justifyHardBreaks = true;

  // Lists: the first look of each kind sets the lists' form.
  const bullets = looks.filter((l) => l.pf.list?.type === 'bullet');
  const numbers = looks.filter((l) => l.pf.list?.type === 'numbered');
  if (bullets[0]) {
    const l = bullets[0];
    const list = l.pf.list!;
    out.unorderedLists = { color: colourOf(ctx, l), indent: pt(Math.max(0, l.pf.leftIndent + l.pf.firstLineIndent)), gap: pt(Math.max(0, -l.pf.firstLineIndent)), marginTop: pt(spaceAbove(l)), marginBottom: pt(l.pf.spaceAfter), itemSpacing: pt(l.pf.spaceBefore + l.pf.spaceAfter) };
    if (list.bullet) out.unorderedLists.bulletChar = list.bullet;
    if (list.bulletGlyph !== undefined) ctx.rep.add('bulletGlyph', 'warning', 'A bullet taken from a font by glyph number is set as Postext\'s default bullet', `${l.path}: glyph ${list.bulletGlyph}${list.bulletFont ? ` of ${list.bulletFont}` : ''}`);
    const chars = new Set(bullets.map((b) => b.pf.list!.bullet).filter(Boolean));
    if (chars.size > 1) ctx.rep.add('bulletCharacters', 'info', 'Lists with different bullets take the bullet of the most used list', [...chars].join(' '));
  }
  if (numbers[0]) {
    const l = numbers[0];
    const list = l.pf.list!;
    out.orderedLists = { indent: pt(Math.max(0, l.pf.leftIndent + l.pf.firstLineIndent)), fontWeight: l.weight, color: colourOf(ctx, l), marginTop: pt(spaceAbove(l)), marginBottom: pt(l.pf.spaceAfter), itemSpacing: pt(l.pf.spaceBefore + l.pf.spaceAfter) };
    const format = NUMBER_FORMATS.find(([re]) => re.test(list.numberFormat ?? '1,'))?.[1];
    if (format) out.orderedLists.numberFormat = format as NonNullable<PostextConfig['orderedLists']>['numberFormat'];
    else if (list.numberFormat) ctx.rep.add('numberFormat', 'warning', 'A numbered list in a number format Postext does not have is numbered in decimal', `${l.path}: ${list.numberFormat}`);
    const m = /^(.*?)\^#(.*?)(?:\^t|\^>|\s*)$/.exec(list.expression ?? '^#.^t');
    if (m) {
      if (m[1]) out.orderedLists.prefix = m[1];
      out.orderedLists.separator = m[2] ?? '';
    } else ctx.rep.add('numberingExpression', 'warning', 'A numbering expression that is more than a prefix, the number and a separator is set as "1."', `${l.path}: ${list.expression}`);
  }
  for (const l of [...bullets, ...numbers]) {
    if (body && (l.cf.pointSize !== body.cf.pointSize || l.cf.fontFamily !== body.cf.fontFamily)) ctx.rep.add('listType', 'warning', 'A list set in another size or typeface than the body keeps the body\'s', l.path);
    reportLook(ctx, l);
  }

  // How each paragraph style was read.
  for (const l of looks) {
    const target = l.role === 'heading' ? `heading ${l.level}${l.id ? ` (heading style ${l.id})` : ''}` : l.role === 'body' ? 'body text' : l.role === 'list' ? `${l.pf.list!.type} list` : l.role === 'quote' ? 'quotation' : `paragraph style ${l.id}`;
    ctx.rep.styles.push({ style: l.path, paragraphs: l.paragraphs, target, reason: l.reason });
    if (l.overrides.size && l.role !== 'body') ctx.rep.add('localOverrides', 'info', 'Paragraphs formatted by hand over their style are read with what they look like, each distinct look a style of its own', `${l.path}: ${[...l.overrides].slice(0, 4).join(', ')}`);
  }
  return out;
}
