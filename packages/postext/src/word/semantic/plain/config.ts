// The plain design of the flow .docx (#1458): the book's resolved config
// with every look made neutral, so the writer sets the same parts in the
// same styles on an A4 page in Arial, in black, with none of the book's
// design. What tells the content stays as the book has it: the ids and
// names of the styles, the numbering of headings, lists, notes and
// resources, the labels of captions and boxes, the language and the
// direction of the text.
//
// Two passes. The first walks the whole config: every colour becomes the
// text's own ink, every fill none, every face the body's, with no
// tracking, capitals or small capitals. The second sets the sizes and
// spaces of each section by hand. The book's design elements (heading and
// part designs, running heads) are emptied here; the writer reads the
// book's own config (`WriterContext.plain.book`) where one of them holds
// words of the Markdown.

import { resolvedCodeStyle } from '../../../defaults/text/codeStyle.js';
import { exerciseSettingsFor } from '../../../exercises/build.js';
import type { ColorValue, Dimension, ResolvedCalloutStyleConfig, ResolvedTableStyleConfig, ResourceType } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const mm = (value: number): Dimension => ({ value, unit: 'mm' });
const em = (value: number): Dimension => ({ value, unit: 'em' });

/** No colour of its own: Word's automatic ink. */
const INK: ColorValue = { hex: '', model: 'hex' };
/** No fill. */
const NO_FILL: ColorValue = { hex: 'transparent', model: 'hex' };

/** The body's size and leading (Word's "multiple 1.15"). */
export const PLAIN_BODY_PT = 11;
export const PLAIN_LINE = 1.15;
const SMALL_PT = 9;
/** Heading sizes, levels 1 to 6. */
const HEADING_PT = [20, 16, 14, 12, 11, 11];
/** The faces every system, Word for the web and Google Docs have. */
export const PLAIN_FONT = 'Arial';
export const PLAIN_MONO = 'Courier New';

/** `value` with its colours, fills, faces, tracking and case neutral. */
function neutral<T>(value: T, key = ''): T {
  if (Array.isArray(value)) return value.map((v: unknown) => neutral(v, key)) as T;
  if (typeof value === 'string') return (/fontFamily$/i.test(key) ? '' : /textTransform$/i.test(key) ? 'none' : value) as T;
  if (typeof value === 'boolean') return (/background\w*Enabled$/i.test(key) || key === 'smallCaps' ? false : value) as T;
  if (!value || typeof value !== 'object') return value;
  const rec = value as Record<string, unknown>;
  if (typeof rec.hex === 'string') return (/background|fill|paper|tint/i.test(key) ? NO_FILL : INK) as T;
  if (/letterSpacing$/i.test(key) && typeof rec.value === 'number') return pt(0) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = neutral(v, k);
  return out as T;
}

function plainTable<T extends ResolvedTableStyleConfig>(s: T): T {
  return { ...s, bodyFontSize: pt(10), headerFontSize: pt(10), headerBold: true, headerItalic: false, borders: true, rules: 'grid', borderWidth: pt(0.5), cellPadding: pt(4) };
}

function plainBox(c: ResolvedCalloutStyleConfig): ResolvedCalloutStyleConfig {
  return {
    ...c,
    span: 'column',
    columns: 1,
    border: { ...c.border, enabled: false, sides: undefined },
    // A thin rule on the side the lines start, the text a little in from it.
    stripe: { enabled: true, side: 'start', width: pt(0.75), color: INK },
    padding: { top: pt(1), right: pt(0), bottom: pt(1), left: pt(8) },
    icon: { ...c.icon, kind: 'none' },
    marker: { ...c.marker, kind: 'none', rule: { ...c.marker.rule, enabled: false } },
    // A label is a first line in bold, never a tab on the box's head.
    ...(c.label ? { label: { ...c.label, position: 'bottom-start', fontSize: pt(SMALL_PT), fontWeight: 700 } } : {}),
    titleStyle: { ...c.titleStyle, fontSize: pt(PLAIN_BODY_PT), fontWeight: 700, italic: false, gap: pt(3), indent: pt(0), lineHeight: em(PLAIN_LINE) },
    body: {
      ...c.body,
      fontSize: pt(PLAIN_BODY_PT),
      lineHeight: em(PLAIN_LINE),
      fontWeight: 400,
      boldFontWeight: 700,
      italic: false,
      textAlign: 'left',
      hyphenation: false,
      paragraphSpacing: pt(6),
      firstLineIndent: pt(0),
      hangingIndent: false,
    },
    lists: { ...c.lists, bulletChar: '•', indent: em(0.5), gap: em(0.5), itemSpacing: pt(3), bulletFontSize: undefined, bulletFontWeight: undefined, marginTop: undefined, marginBottom: pt(6) },
    marginTop: pt(6),
    marginBottom: pt(6),
  };
}

/** Whether a paragraph style sets its paragraphs one under the other
 *  with no space between them, as lines rather than running text: flush
 *  (an address, a credit), or each with its turnovers hung (a line of
 *  verse, an entry of a list). Paragraphs told apart by a first-line
 *  indent alone are running text. */
const solid = (p: { spaceBetween: Dimension; firstLineIndent: Dimension; hangingIndent: Dimension }): boolean => p.spaceBetween.value === 0 && (p.firstLineIndent.value === 0 || p.hangingIndent.value > 0);

/** The neutral config of a book whose resolved config is `book`. */
export function plainConfig(book: ResolvedConfig): ResolvedConfig {
  // The templates stay as written: they say which frame takes what, and
  // the engine resolves them from this very list.
  const { colorPalette: _palette, pageTemplates, ...rest } = book;
  const n = neutral({ ...rest, exerciseSettings: exerciseSettingsFor(book) }) as ResolvedConfig;
  const body = n.bodyText;
  const code = neutral(resolvedCodeStyle(book));
  const none = { elements: [] };
  return {
    ...n,
    ...(pageTemplates ? { pageTemplates } : {}),
    page: {
      ...n.page,
      sizePreset: 'custom',
      width: mm(210),
      height: mm(297),
      margins: { top: mm(25), bottom: mm(25), left: mm(25), right: mm(25), mirror: false },
      pageNumbering: { format: 'decimal', startAt: 1 },
    },
    layout: { ...n.layout, layoutType: 'single', columnCount: 1, writingMode: 'horizontal-tb' },
    bodyText: {
      ...body,
      fontFamily: PLAIN_FONT,
      fontSize: pt(PLAIN_BODY_PT),
      lineHeight: em(PLAIN_LINE),
      paragraphSpacing: pt(6),
      textAlign: 'left',
      fontWeight: 400,
      boldFontWeight: 700,
      referenceBold: false,
      referenceItalic: false,
      hyphenation: { ...body.hyphenation, enabled: false },
      firstLineIndent: pt(0),
      hangingIndent: false,
      indentAfterHeading: false,
      italic: undefined,
      hangingIndentLength: undefined,
      ownFirstLineIndent: undefined,
      blockquote: { ...body.blockquote, italic: false, indent: mm(10), firstLineIndent: undefined },
    },
    headings: {
      ...n.headings,
      textAlign: 'left',
      fontWeight: 700,
      balancing: { ...n.headings.balancing, enabled: false },
      levels: n.headings.levels.map((l) => ({
        ...l,
        fontSize: pt(HEADING_PT[Math.min(6, Math.max(1, l.level)) - 1]!),
        lineHeight: em(1.2),
        fontWeight: 700,
        italic: false,
        marginTop: pt(l.level <= 2 ? 18 : 12),
        marginBottom: pt(6),
        // A chapter title still opens its page; no other heading does.
        breakBefore: { enabled: l.level === 1 && l.breakBefore.enabled, parity: 'any' },
        span: 'column',
        spanBreak: undefined,
        advancedDesign: { enabled: false, slot: none },
        snapToGrid: false,
        lineSpan: undefined,
        indent: undefined,
        firstLineIndent: undefined,
        jidori: undefined,
        dropCap: undefined,
        figureStyle: undefined,
      })),
    },
    headingStyles: n.headingStyles.map((s) => ({
      id: s.id,
      name: s.name,
      numbered: s.numbered,
      toc: s.toc,
      runningChapter: s.runningChapter,
      sectionEnd: s.sectionEnd,
      palette: {},
      ...(s.numberingTemplate !== undefined ? { numberingTemplate: s.numberingTemplate } : {}),
      // What a style says about the heading's words, not its look.
      overrides: {
        ...(s.overrides.hidden !== undefined ? { hidden: s.overrides.hidden } : {}),
        ...(s.overrides.numberSeparator !== undefined ? { numberSeparator: s.overrides.numberSeparator } : {}),
        ...(s.overrides.numberPosition !== undefined ? { numberPosition: s.overrides.numberPosition } : {}),
      },
      // A style that runs on under the heading before it still does.
      ...(s.breakBefore?.enabled === false ? { breakBefore: { enabled: false } } : {}),
    })),
    captionStyle: {
      ...n.captionStyle,
      fontSize: pt(SMALL_PT),
      align: 'center',
      gap: pt(4),
      labelBold: true,
      labelItalic: false,
      // The caption style itself is italic (`plainStyleDef`).
      descriptionItalic: false,
      padding: pt(0),
      note: { ...n.captionStyle.note, fontSize: pt(SMALL_PT), italic: false, gap: pt(2), align: 'center' },
    },
    tableStyle: plainTable(n.tableStyle),
    tableStyles: n.tableStyles.map(plainTable),
    paragraphStyles: n.paragraphStyles.map((p) => ({
      ...p,
      fontSize: pt(PLAIN_BODY_PT),
      lineHeight: em(PLAIN_LINE),
      textAlign: 'left',
      fontWeight: 400,
      boldFontWeight: 700,
      italic: false,
      hyphenation: false,
      indent: pt(0),
      endIndent: undefined,
      firstLineIndent: pt(0),
      hangingIndent: pt(0),
      // Lines the book sets solid (a poem's, an address's) stay solid;
      // paragraphs it tells apart by an indent get the body's space.
      spaceBetween: solid(p) ? pt(0) : pt(6),
      // Solid lines keep no space around their group where the book keeps
      // none (the opening line of a verse paragraph and the lines under
      // it are two styles, one block).
      marginTop: solid(p) && p.marginTop.value !== 0 ? pt(6) : pt(0),
      marginBottom: solid(p) && p.marginBottom.value === 0 ? pt(0) : pt(6),
    })),
    calloutStyles: n.calloutStyles.map(plainBox),
    chipStyles: n.chipStyles.map((c) => ({ ...c, borderWidth: pt(0), fontSize: undefined, bold: false, italic: false })),
    unorderedLists: {
      ...n.unorderedLists,
      bulletChar: '•',
      bulletFontSize: em(1),
      fontWeight: 400,
      italic: false,
      indent: em(1),
      gap: em(0.5),
      marginTop: pt(0),
      // The space a paragraph leaves after it.
      marginBottom: pt(6),
      itemSpacing: pt(3),
      levels: n.unorderedLists.levels.map((l) => ({ ...l, bulletChar: l.level % 2 ? '•' : '–', fontSize: em(1), fontWeight: 400, italic: false, indent: undefined })),
    },
    orderedLists: {
      ...n.orderedLists,
      numberFontSize: em(1),
      fontWeight: 400,
      italic: false,
      indent: em(1),
      gap: em(0.5),
      marginTop: pt(0),
      // The space a paragraph leaves after it.
      marginBottom: pt(6),
      itemSpacing: pt(3),
      numberAlign: 'start',
      separatorFontWeight: 400,
      separatorItalic: false,
      levels: n.orderedLists.levels.map((l) => ({ ...l, fontSize: em(1), fontWeight: 400, italic: false, indent: undefined, separatorFontWeight: 400 })),
    },
    math: { ...n.math, indentAfterDisplay: false },
    header: none,
    footer: none,
    parts: { ...n.parts, design: none, versoDesign: none, bodyStyle: { ...n.parts.bodyStyle, fontSize: pt(PLAIN_BODY_PT), lineHeight: em(PLAIN_LINE), textAlign: 'left' } },
    toc: {
      ...n.toc,
      levels: n.toc.levels.map((l) => ({
        ...l,
        fontSize: pt(PLAIN_BODY_PT),
        lineHeight: em(PLAIN_LINE),
        fontWeight: 400,
        italic: false,
        indent: pt((Math.max(1, l.level) - 1) * 14),
        numberWidth: em(2.4),
        numberGap: em(0.5),
        numberFontSize: pt(PLAIN_BODY_PT),
        numberFontWeight: 400,
        marginTop: pt(0),
        marginBottom: pt(3),
      })),
      unnumbered: {},
      pageNumber: { ...n.toc.pageNumber, fontSize: pt(PLAIN_BODY_PT), fontWeight: 400, italic: false },
      leader: { ...n.toc.leader, enabled: true },
      subtitle: { ...n.toc.subtitle, fontSize: pt(SMALL_PT), fontWeight: 400, italic: true, indent: pt(0) },
      parts: { ...n.toc.parts, design: none, marginTop: pt(8), marginBottom: pt(3) },
    },
    footnotes: {
      ...n.footnotes,
      fontSize: pt(SMALL_PT),
      lineHeight: em(PLAIN_LINE),
      textAlign: 'left',
      hangingIndent: pt(0),
      spaceBetween: pt(2),
      spaceBelowRule: pt(4),
      separator: { enabled: true, width: 0.3, lineWidth: pt(0.5) },
    },
    codeStyle: {
      ...code,
      // The monospace face every reader has, a little small.
      fontFamily: PLAIN_MONO,
      fontSize: pt(10),
      fontWeight: 400,
      boldFontWeight: 700,
      lineHeight: undefined,
      marginTop: pt(6),
      marginBottom: pt(6),
      border: { ...code.border, enabled: false },
      span: 'column',
    },
  };
}

/** The caption keys of a resource type that say where its caption stands
 *  and how its label reads; the rest is the caption's look. */
const CAPTION_WORDS = ['position', 'labelSeparator', 'labelNumberGap'] as const;

/** The book's resource types with the look of their captions left out. */
export function plainResourceTypes(types: readonly ResourceType[]): ResourceType[] {
  return types.map((t) => {
    if (!t.captionStyle) return t;
    const words: Record<string, unknown> = {};
    for (const k of CAPTION_WORDS) if (t.captionStyle[k] !== undefined) words[k] = t.captionStyle[k];
    return { ...t, captionStyle: words as ResourceType['captionStyle'] };
  });
}
