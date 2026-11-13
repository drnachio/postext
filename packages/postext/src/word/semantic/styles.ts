// styles.xml of the semantic .docx (#1390): the book's design read from the
// resolved config — body text, heading levels and named heading styles,
// paragraph styles, box styles, quotes, captions, code, footnotes — as
// Word styles, with the real font families of the font plan when the
// export embeds fonts.

import type { ResolvedConfig } from '../../vdt.js';
import type { ColorValue } from '../../types.js';
import type { ResolvedCalloutStyleConfig, ResolvedCaptionStyleConfig, ResolvedHeadingLevelConfig, TextAlign } from '../../types.js';
import { resolvedCodeStyle } from '../../defaults/text/codeStyle.js';
import type { WordFontPlan } from '../fonts/types.js';
import { wordFontFor } from '../fonts/plan.js';
import { escapeAttr } from '../xml.js';
import { paleOnWhite } from './design/ink.js';
import { plainStyleDef } from './plain/styles.js';
import { characterStyleRun, markRunLook } from './prose/characterStyle.js';
import { chipLine } from './prose/chips.js';
import { captionLook, sameCaptionLook } from './prose/caption.js';
import { boxBodyIndent, paragraphStyleLook, tocLevelLook, type TocLevelNumbering } from './prose/paragraphStyle.js';
import { styleLeadings } from './prose/leading.js';
import { firstFamily, halfPoints, hex, pPr, px, rPr, twips, type ParaProps, type RunProps, type Units } from './wml.js';

/** Style ids the writer uses by name. */
export const STYLE = {
  normal: 'Normal',
  quote: 'Quote',
  caption: 'Caption',
  list: 'ListParagraph',
  footnoteText: 'FootnoteText',
  footnoteRef: 'FootnoteReference',
  hyperlink: 'Hyperlink',
  header: 'Header',
  footer: 'Footer',
  source: 'PostextSource',
  sourceChar: 'PostextSourceChar',
  reference: 'PostextReference',
  citation: 'PostextCitation',
  mark: 'PostextMark',
  chip: 'PostextChip',
  code: 'PostextCode',
  codeChar: 'PostextCodeChar',
  math: 'PostextEquation',
  figure: 'PostextFigure',
  verse: 'PostextVerse',
  part: 'PostextPart',
  boxTitle: 'PostextBoxTitle',
} as const;

const JC: Record<TextAlign, ParaProps['jc']> = { left: 'left', justify: 'both', center: 'center', right: 'right' };

const slug = (s: string): string => s.replace(/[^A-Za-z0-9]/g, '') || 'X';

export interface StyleDef {
  type: 'paragraph' | 'character';
  name: string;
  basedOn?: string;
  next?: string;
  isDefault?: boolean;
  custom?: boolean;
  semiHidden?: boolean;
  pPr?: ParaProps;
  rPr?: RunProps;
}

export class StyleRegistry {
  /** The styles defined, by id (a chapter style's are read beside the book's, #1521). */
  readonly defs = new Map<string, StyleDef>();
  private readonly byKey = new Map<string, string>();
  private readonly chipIds = new Map<string, string>();
  /** The face each paragraph style sets its text in (#1444). */
  private readonly faces = new Map<string, { stack: string | undefined; weight: number; italic: boolean }>();
  private readonly inks = new Map<string, { bold?: string; italic?: string }>();
  readonly bodyPx: number;

  constructor(
    readonly resolved: ResolvedConfig,
    private readonly units: Units,
    private readonly plan?: WordFontPlan,
    /** The plain design (#1458): each style as `plainStyleDef` sets it. */
    private readonly plain = false,
  ) {
    this.bodyPx = units.basePx;
    this.builtins();
  }

  /** Font of a family stack at a weight/style, through the font plan. */
  font(stack: string | undefined, weight = 400, italic = false): RunProps {
    const family = firstFamily(stack);
    if (!family) return {};
    if (!this.plan) return { font: family, ...(weight >= 600 ? { b: true } : {}), ...(italic ? { i: true } : {}) };
    const ref = wordFontFor(this.plan, `${italic ? 'italic ' : ''}${weight} 16px "${family}"`);
    return { font: ref.family, ...(ref.bold ? { b: true } : {}), ...(ref.italic ? { i: true } : {}) };
  }

  /**
   * The family a bold or italic run of a paragraph style takes when its
   * face lies in another Word family than the style's own (#1444): a Light
   * body's italic is the 400 italic, filed under the regular family, as a
   * browser picks it. Word would otherwise slant the Light upright or, in
   * LibreOffice, set another family's italic. Nothing when the slot of the
   * style's own family serves.
   */
  runFont(style: string | undefined, bold: boolean, italic: boolean): string | undefined {
    if (!this.plan || (!bold && !italic)) return undefined;
    const face = this.faces.get(style ?? STYLE.normal);
    if (!face) return undefined;
    const own = this.font(face.stack, face.weight, face.italic).font;
    const weight = bold ? Math.max(face.weight, this.resolved.bodyText.boldFontWeight) : face.weight;
    const styled = this.font(face.stack, weight, italic || face.italic).font;
    return styled && styled !== own ? styled : undefined;
  }

  /** The colour a bold or italic run of a paragraph style takes when the
   *  style sets one apart from its text (#1444): a key term in a box's
   *  colour, as the engine paints `boldColor` and `italicColor`. */
  runInk(style: string | undefined, bold: boolean, italic: boolean): string | undefined {
    const ink = this.inks.get(style ?? STYLE.normal);
    return (bold && ink?.bold) || (italic && ink?.italic) || undefined;
  }

  /** Record the emphasis colours of a style that differ from its text's. */
  private ink(id: string, color: ColorValue | undefined, bold: ColorValue | undefined, italic: ColorValue | undefined): string {
    const text = hex(color);
    const differs = (c: ColorValue | undefined): string | undefined => (hex(c) && hex(c) !== text ? hex(c) : undefined);
    const ink = { bold: differs(bold), italic: differs(italic) };
    if (ink.bold || ink.italic) this.inks.set(id, ink);
    return id;
  }

  /** The text size of a style, half-points: its own or the style's it is
   *  based on, else the body's. */
  styleSize(style: string | undefined): number {
    for (let id = style, n = 0; id && n < 8; n++) {
      const def = this.defs.get(id);
      if (def?.rPr?.sz) return def.rPr.sz;
      id = def?.basedOn;
    }
    return halfPoints(this.units, this.resolved.bodyText.fontSize);
  }

  private face(id: string, stack: string | undefined, weight = 400, italic = false): string {
    this.faces.set(id, { stack, weight, italic });
    return id;
  }

  private add(id: string, def: StyleDef): string {
    if (!this.defs.has(id)) this.defs.set(id, this.plain ? plainStyleDef(id, def) : def);
    return id;
  }

  /** The name of style `id` (what a STYLEREF field names). */
  nameOf(id: string): string | undefined {
    return this.defs.get(id)?.name;
  }

  /** A unique style id for a key (config ids may collide once slugged). */
  private idFor(key: string, prefix: string, name: string): { id: string; fresh: boolean } {
    const known = this.byKey.get(key);
    if (known) return { id: known, fresh: false };
    let id = prefix + slug(name);
    for (let n = 2; this.defs.has(id); n++) id = `${prefix}${slug(name)}${n}`;
    this.byKey.set(key, id);
    return { id, fresh: true };
  }

  private builtins(): void {
    const r = this.resolved;
    const u = this.units;
    const body = r.bodyText;
    const bodyPx = px(u, body.fontSize);
    const line = twips(u, body.lineHeight, bodyPx);
    const after = body.paragraphSpacing === false ? 0 : body.paragraphSpacing === true ? line : twips(u, body.paragraphSpacing, bodyPx);
    this.add(this.ink(this.face(STYLE.normal, body.fontFamily, body.fontWeight), body.color, body.boldColor, body.italicColor), {
      type: 'paragraph',
      name: 'Normal',
      isDefault: true,
      pPr: {
        before: 0,
        after,
        line: { twips: line, rule: 'atLeast' },
        ind: { firstLine: twips(u, body.firstLineIndent, bodyPx) },
        jc: JC[body.textAlign],
        bidi: r.direction === 'rtl' || undefined,
      },
      rPr: { ...this.font(body.fontFamily, body.fontWeight), color: hex(body.color), sz: halfPoints(u, body.fontSize) },
    });
    for (const level of r.headings.levels) this.headingLevel(level);
    const bq = body.blockquote;
    this.add(this.face(STYLE.quote, body.fontFamily, body.fontWeight, bq.italic), {
      type: 'paragraph',
      name: 'Quote',
      basedOn: STYLE.normal,
      pPr: { ind: { left: twips(u, bq.indent, bodyPx), right: twips(u, bq.indent, bodyPx), firstLine: bq.firstLineIndent ? twips(u, bq.firstLineIndent, bodyPx) : undefined } },
      rPr: { i: bq.italic, color: hex(bq.color) },
    });
    const cap = r.captionStyle;
    this.add(this.face(STYLE.caption, cap.fontFamily ?? body.fontFamily, cap.fontFamily ? 400 : body.fontWeight), {
      type: 'paragraph',
      name: 'caption',
      basedOn: STYLE.normal,
      next: STYLE.normal,
      ...captionLook(u, cap, line, this.font(cap.fontFamily)),
    });
    const lists = r.unorderedLists;
    // A list item's text is the body's: its italic and bold runs take the
    // body's faces (#1444).
    this.add(this.ink(this.face(STYLE.list, body.fontFamily, body.fontWeight), body.color, body.boldColor, body.italicColor), {
      type: 'paragraph',
      name: 'List Paragraph',
      basedOn: STYLE.normal,
      pPr: { after: twips(u, lists.itemSpacing, bodyPx), contextualSpacing: true, ind: { firstLine: 0 } },
    });
    const fn = r.footnotes;
    const fnPx = px(u, fn.fontSize);
    this.add(this.ink(this.face(STYLE.footnoteText, body.fontFamily, body.fontWeight), fn.color, body.boldColor, body.italicColor), {
      type: 'paragraph',
      name: 'footnote text',
      basedOn: STYLE.normal,
      pPr: { after: twips(u, fn.spaceBetween, fnPx), line: { twips: twips(u, fn.lineHeight, fnPx), rule: 'atLeast' }, ind: { firstLine: 0 }, jc: fn.textAlign ? JC[fn.textAlign] : undefined },
      rPr: { color: hex(fn.color), sz: halfPoints(u, fn.fontSize) },
    });
    this.add(STYLE.footnoteRef, { type: 'character', name: 'footnote reference', rPr: { vertAlign: 'superscript' } });
    this.add(STYLE.hyperlink, { type: 'character', name: 'Hyperlink', rPr: { color: hex(body.referenceColor), u: true } });
    const small = { sz: Math.max(2, Math.round(halfPoints(u, body.fontSize) * 0.85)) };
    this.add(STYLE.header, { type: 'paragraph', name: 'header', basedOn: STYLE.normal, pPr: { ind: { firstLine: 0 }, jc: 'center' }, rPr: small });
    this.add(STYLE.footer, { type: 'paragraph', name: 'footer', basedOn: STYLE.normal, pPr: { ind: { firstLine: 0 }, jc: 'center' }, rPr: small });
    // Source the writer could not convert: a monospace face that Word,
    // LibreOffice and Google Docs all have (Consolas is Windows only, and
    // LibreOffice elsewhere falls back to a serif).
    const mono = { font: 'Courier New' };
    this.add(STYLE.source, {
      type: 'paragraph',
      name: 'Postext Source',
      custom: true,
      basedOn: STYLE.normal,
      pPr: { shd: 'EDEDED', suppressAutoHyphens: true, bidi: r.direction === 'rtl' ? false : undefined, before: 0, after: 0, line: { twips: 240, rule: 'auto' }, ind: { firstLine: 0 }, jc: 'left' },
      rPr: { ...mono, color: '595959', sz: Math.max(16, small.sz) },
    });
    this.add(STYLE.sourceChar, { type: 'character', name: 'Postext Source Char', custom: true, rPr: { ...mono, color: '595959', shd: 'EDEDED' } });
    this.add(STYLE.reference, { type: 'character', name: 'Postext Reference', custom: true, rPr: { color: hex(body.referenceColor), b: body.referenceBold || undefined, i: body.referenceItalic || undefined } });
    // Citations as the engine sets them (#1518): in the text's own weight
    // and colour (the cross-reference look is not theirs), in a style of
    // their own so an editor and the importer tell them from references.
    this.add(STYLE.citation, { type: 'character', name: 'Postext Citation', custom: true, rPr: {} });
    // The band of a mark as run shading in the mark style's colour:
    // LibreOffice drops a highlight set in a character style.
    const mark = r.markStyles?.[0];
    this.add(STYLE.mark, { type: 'character', name: 'Postext Mark', custom: true, rPr: mark ? markRunLook(mark) : { shd: 'FFF0A0' } });
    this.add(STYLE.chip, { type: 'character', name: 'Postext Chip', custom: true, rPr: { shd: 'E7E6E6' } });
    const code = resolvedCodeStyle(r);
    const codePx = px(u, code.fontSize, bodyPx);
    this.add(STYLE.code, {
      type: 'paragraph',
      name: 'Postext Code',
      custom: true,
      basedOn: STYLE.normal,
      pPr: {
        shd: code.backgroundEnabled ? hex(code.background) : undefined,
        suppressAutoHyphens: true,
        bidi: r.direction === 'rtl' ? false : undefined,
        before: twips(u, code.marginTop, bodyPx),
        after: twips(u, code.marginBottom, bodyPx),
        line: code.lineHeight ? { twips: twips(u, code.lineHeight, codePx), rule: 'atLeast' } : undefined,
        ind: { firstLine: 0 },
        jc: 'left',
      },
      rPr: { ...this.font(code.fontFamily, code.fontWeight), color: hex(code.color), sz: halfPoints(u, code.fontSize, bodyPx) },
    });
    const inline = code.inline;
    this.add(STYLE.codeChar, { type: 'character', name: 'Postext Code Char', custom: true, rPr: { ...this.font(inline ? code.fontFamily : undefined), ...(inline ? {} : { font: firstFamily(code.fontFamily) }) } });
    this.add(STYLE.math, { type: 'paragraph', name: 'Postext Equation', custom: true, basedOn: STYLE.normal, pPr: { ind: { firstLine: 0 }, jc: 'center' } });
    this.add(STYLE.figure, { type: 'paragraph', name: 'Postext Figure', custom: true, basedOn: STYLE.normal, pPr: { keepNext: true, ind: { firstLine: 0 }, jc: 'center' } });
    this.add(STYLE.verse, { type: 'paragraph', name: 'Postext Verse', custom: true, basedOn: STYLE.normal, pPr: { ind: { left: twips(u, bq.indent, bodyPx), firstLine: 0 }, jc: 'left' } });
    this.add(STYLE.part, { type: 'paragraph', name: 'Postext Part', custom: true, basedOn: STYLE.normal, pPr: { pageBreakBefore: true, keepNext: true, ind: { firstLine: 0 }, jc: 'center', outlineLvl: 0 }, rPr: { b: true, sz: halfPoints(u, body.fontSize) * 2 } });
    this.add(STYLE.boxTitle, { type: 'paragraph', name: 'Postext Box Title', custom: true, basedOn: STYLE.normal, pPr: { keepNext: true, ind: { firstLine: 0 } }, rPr: { b: true } });
  }

  /** The alignment a paragraph style ends up with, through its `basedOn`
   *  chain. */
  jcOf(id: string | undefined): ParaProps['jc'] {
    for (let k = 0, d = id ? this.defs.get(id) : undefined; d && k < 16; k++, d = d.basedOn ? this.defs.get(d.basedOn) : undefined) {
      if (d.pPr?.jc) return d.pPr.jc;
    }
    return undefined;
  }

  /** Whether a paragraph style hangs its lines after the first (through
   *  its `basedOn` chain). */
  hangs(id: string | undefined): boolean {
    for (let k = 0, d = id ? this.defs.get(id) : undefined; d && k < 16; k++, d = d.basedOn ? this.defs.get(d.basedOn) : undefined) {
      if (d.pPr?.ind?.hanging !== undefined) return d.pPr.ind.hanging > 0;
      if (d.pPr?.ind?.firstLine !== undefined) return false;
    }
    return false;
  }

  /** The caption style of a resource type whose caption style is not the
   *  document's (a table captioned above, in its own size): one based on
   *  `Caption`, made once per type. */
  caption(cap: ResolvedCaptionStyleConfig, typeId: string): string {
    if (sameCaptionLook(cap, this.resolved.captionStyle)) return STYLE.caption;
    const u = this.units;
    const line = twips(u, this.resolved.bodyText.lineHeight, px(u, this.resolved.bodyText.fontSize));
    const look = captionLook(u, cap, line, this.font(cap.fontFamily), this.resolved.captionStyle);
    const id = this.define(`caption:${typeId}`, 'PostextCaption', typeId, () => ({ type: 'paragraph', name: `Caption: ${typeId}`, custom: true, basedOn: STYLE.caption, next: STYLE.normal, ...look }));
    return this.face(id, cap.fontFamily || this.resolved.bodyText.fontFamily, cap.fontFamily ? 400 : this.resolved.bodyText.fontWeight);
  }

  /** The character style of a chip style: its fill, ink and face. Style
   *  ids never contain a word the importer reads as run formatting
   *  (`bold`, `code`…), so a chip does not come back as an edit. */
  chip(styleId: string | undefined): string {
    const styles = this.resolved.chipStyles ?? [];
    const cs = (styleId ? styles.find((s) => s.id === styleId) : undefined) ?? styles[0];
    if (!cs) return STYLE.chip;
    const known = this.chipIds.get(cs.id);
    if (known) return known;
    let id = `${STYLE.chip}${slug(cs.id)}`;
    if (/strong|bold|emphasis|italic|smallcaps|superscript|subscript|code|verbatim/i.test(id) || this.defs.has(id)) id = `${STYLE.chip}${this.chipIds.size + 1}`;
    this.chipIds.set(cs.id, id);
    const u = this.units;
    this.add(id, {
      type: 'character',
      name: `Postext Chip: ${cs.name || cs.id}`,
      custom: true,
      basedOn: STYLE.chip,
      rPr: {
        ...(cs.fontFamily ? this.font(cs.fontFamily, cs.bold ? 700 : 400, cs.italic) : {}),
        b: cs.bold || undefined,
        i: cs.italic || undefined,
        color: hex(cs.color),
        sz: cs.fontSize ? halfPoints(u, cs.fontSize, this.bodyPx) : undefined,
        ...chipLine(cs, u, this.bodyPx),
        // A white fill is the paper's: as run shading it would only show
        // as a box over a shaded cell or band (#1444).
        shd: cs.backgroundEnabled && hex(cs.background) !== 'FFFFFF' ? hex(cs.background) : 'auto',
      },
    });
    return id;
  }

  /** A style another module defines (the table styles, #1444): made once
   *  per key, under a unique id of `prefix` and `name`. */
  define(key: string, prefix: string, name: string, make: () => StyleDef): string {
    const { id, fresh } = this.idFor(key, prefix, name);
    if (fresh) this.add(id, make());
    return id;
  }

  private headingProps(level: ResolvedHeadingLevelConfig, align: TextAlign): { pPr: ParaProps; rPr: RunProps } {
    const u = this.units;
    const size = px(u, level.fontSize, this.bodyPx);
    // A line much taller than its letters (a section title on two body
    // lines): the engine sets the letters in the middle of the line, Word
    // at its foot, against the text below. Half of the room the line has
    // to spare moves from above the title to under it (#1458).
    const spare = px(u, level.lineHeight, size) - size * 1.25;
    const shift = spare > size * 0.25 ? Math.round(((spare / 2) * 1440) / u.dpi) : 0;
    return {
      pPr: {
        keepNext: true,
        keepLines: true,
        suppressAutoHyphens: true,
        before: Math.max(0, twips(u, level.marginTop, size) - shift),
        after: twips(u, level.marginBottom, size) + shift,
        line: { twips: twips(u, level.lineHeight, size), rule: 'atLeast' },
        ind: { left: level.indent ? twips(u, level.indent, size) : undefined, firstLine: level.firstLineIndent ? twips(u, level.firstLineIndent, size) : 0 },
        jc: JC[align],
        outlineLvl: Math.min(8, Math.max(0, level.level - 1)),
      },
      rPr: {
        ...this.font(level.fontFamily, level.fontWeight, level.italic),
        b: level.fontWeight >= 600,
        i: level.italic,
        caps: level.textTransform === 'uppercase' || undefined,
        // A heading the design sets in white on a band keeps the paper's ink.
        color: paleOnWhite(hex(level.color)) ? undefined : hex(level.color),
        spacing: level.letterSpacing.value ? twips(u, level.letterSpacing, size) : undefined,
        sz: halfPoints(u, level.fontSize, this.bodyPx),
      },
    };
  }

  private headingLevel(level: ResolvedHeadingLevelConfig): void {
    if (level.level < 1 || level.level > 6) return;
    const { pPr: p, rPr: r } = this.headingProps(level, this.resolved.headings.textAlign);
    // A level that opens a page (chapters) keeps it in Word, so a heading
    // the user adds there opens one too (#1444). The writer also starts a
    // section at each such heading, for the side and the opener's header;
    // a paragraph at the top of a new section's page breaks nothing more.
    // The engine drops a heading's space above at the top of a page, where
    // a heading that opens one always stands.
    if (level.breakBefore.enabled) Object.assign(p, { pageBreakBefore: true, before: 0 });
    this.add(`Heading${level.level}`, { type: 'paragraph', name: `heading ${level.level}`, basedOn: STYLE.normal, next: STYLE.normal, pPr: p, rPr: r });
  }

  /** The style of a heading: its level's, or the named heading style's
   *  (a style per name and level, based on the level's). */
  heading(level: number, styleName?: string): string {
    const lv = Math.min(6, Math.max(1, level));
    const base = `Heading${lv}`;
    if (!styleName) return base;
    const hs = this.resolved.headingStyles.find((s) => s.id === styleName || s.name === styleName);
    if (!hs) return base;
    const { id, fresh } = this.idFor(`heading:${hs.id}:${lv}`, 'PostextHeading', `${hs.id}${lv}`);
    if (fresh) {
      const levelConfig = this.resolved.headings.levels.find((l) => l.level === lv);
      if (levelConfig) {
        const merged = { ...levelConfig, ...hs.overrides } as ResolvedHeadingLevelConfig;
        const { pPr: p, rPr: r } = this.headingProps(merged, this.resolved.headings.textAlign);
        // A style that opens a page (a cover, a half-title, a title page)
        // keeps it in Word, so a run of such headings in one chapter does
        // not pile up on one page (#1444). A chapter's first heading is at
        // the top of its section's page already, where the break adds none.
        // A style that does not break (a second article set under the end
        // of the first) cancels its level's break.
        const breaks = hs.breakBefore?.enabled ?? levelConfig.breakBefore.enabled;
        if (breaks || levelConfig.breakBefore.enabled) p.pageBreakBefore = breaks;
        if (breaks) p.before = 0;
        this.add(id, { type: 'paragraph', name: `Heading ${lv}: ${hs.name || hs.id}`, custom: true, basedOn: base, next: STYLE.normal, pPr: p, rPr: r });
      } else this.add(id, { type: 'paragraph', name: `Heading ${lv}: ${hs.name || hs.id}`, custom: true, basedOn: base });
    }
    return id;
  }

  /** Word's own style of a contents or index entry at `level` (1–9):
   *  `toc N` / `index N`, the names Word applies when it updates the
   *  field. A contents level takes its entry's look from the config
   *  (#1444), its page-number tab (`endTwips`) and, by how its entries
   *  are numbered, its number column; an index level is indented one step
   *  further. */
  listing(kind: 'toc' | 'index', level: number, endTwips?: number, numbering?: TocLevelNumbering): string {
    const lv = Math.min(9, Math.max(1, level));
    const id = kind === 'toc' ? `TOC${lv}` : `Index${lv}`;
    if (this.defs.has(id)) return id;
    const look = kind === 'toc' ? tocLevelLook(this.resolved, this.units, (f, w, i) => this.font(f, w, i), lv, endTwips, numbering) : { pPr: { before: 0, after: 0, ind: { left: lv * 240, hanging: 240 }, jc: 'left' as const } };
    return this.add(id, { type: 'paragraph', name: `${kind} ${lv}`, basedOn: STYLE.normal, next: STYLE.normal, ...look });
  }

  /** Word's own style of an index letter head (`index heading`), bold and
   *  a line above, set apart from the entries before. */
  indexHeading(): string {
    return this.add('IndexHeading', { type: 'paragraph', name: 'index heading', basedOn: STYLE.normal, next: 'Index1', pPr: { before: 240, after: 0, keepNext: true, ind: { firstLine: 0 }, jc: 'left' }, rPr: { b: true } });
  }

  /** The Word style of a named paragraph style (`:::paragraphs{style}`). */
  paragraphStyle(name: string): string | undefined {
    const ps = this.resolved.paragraphStyles.find((s) => s.id === name || s.name === name);
    if (!ps) return undefined;
    const { id, fresh } = this.idFor(`para:${ps.id}`, 'PostextPara', ps.id);
    const look = (): StyleDef => ({ type: 'paragraph', name: ps.name || ps.id, custom: true, basedOn: STYLE.normal, ...paragraphStyleLook(this.units, this.bodyPx, (f, w, i) => this.font(f, w, i), ps) });
    if (fresh) this.add(this.ink(this.face(id, ps.fontFamily, ps.fontWeight, ps.italic), ps.color, ps.boldColor ?? this.resolved.bodyText.boldColor, ps.italicColor ?? this.resolved.bodyText.italicColor), look());
    return id;
  }

  /** The list paragraph style of a box's text style (#1444): its items
   *  set in the box's face, size, leading and colour, as the engine sets
   *  a list in a box, not in the body's. */
  boxList(body: string): string {
    if (body === STYLE.normal || !this.defs.has(body)) return STYLE.list;
    const { id, fresh } = this.idFor(`list:${body}`, 'PostextList', body.replace(/^Postext/, ''));
    if (!fresh) return id;
    const face = this.faces.get(body);
    if (face) this.faces.set(id, face);
    const ink = this.inks.get(body);
    if (ink) this.inks.set(id, ink);
    return this.add(id, { type: 'paragraph', name: `List: ${this.defs.get(body)!.name}`, custom: true, basedOn: body, pPr: { contextualSpacing: true, ind: { firstLine: 0 } } });
  }

  /** The leading of a paragraph style, twips: its own or the style's it is
   *  based on (Normal's at the end of the chain). */
  lineOf(style: string | undefined): number | undefined {
    for (let id = style ?? STYLE.normal, n = 0; id && n < 8; n++) {
      const def = this.defs.get(id);
      if (def?.pPr?.line) return def.pPr.line.twips;
      id = def?.basedOn ?? (id === STYLE.normal ? '' : STYLE.normal);
    }
    return undefined;
  }

  /** A paragraph style of the writer's own, made once per `key` (a heading
   *  design's text, a box's label tab): `make` gives its look. */
  custom(key: string, name: string, make: () => { basedOn?: string; pPr?: ParaProps; rPr?: RunProps }): string {
    const { id, fresh } = this.idFor(`custom:${key}`, 'Postext', name);
    // Two looks of one element (sizes fitted to different titles) get ids
    // …title and …title2; the names differ the same way, since LibreOffice
    // keys styles by name and would merge them.
    const n = id.slice(`Postext${slug(name)}`.length);
    if (fresh) this.add(id, { type: 'paragraph', name: `Postext ${name}${n ? ` ${n}` : ''}`, custom: true, basedOn: STYLE.normal, next: STYLE.normal, ...make() });
    return id;
  }

  /** The Word character style of a character style
   *  (`:span[…]{style="id"}`), named `Postext Style: <name>` in every
   *  language, as the importer reads it back; undefined when the book has
   *  no style of that id (the run sets as the text around it, as on the
   *  page). */
  characterStyle(styleId: string): string | undefined {
    const cs = this.resolved.characterStyles?.find((s) => s.id === styleId);
    if (!cs) return undefined;
    const mark = cs.mark !== undefined ? this.resolved.markStyles?.find((m) => m.id === cs.mark) : undefined;
    const { id, fresh } = this.idFor(`char:${cs.id}`, 'PostextCharStyle', cs.id);
    if (fresh) this.add(id, { type: 'character', name: `Postext Style: ${cs.name || cs.id}`, custom: true, rPr: characterStyleRun(cs, mark, this.units, this.bodyPx, (f, w, i) => this.font(f, w, i)) });
    return id;
  }

  /** The box style named by a callout's `type`. */
  callout(type: string | undefined): ResolvedCalloutStyleConfig | undefined {
    const styles = this.resolved.calloutStyles;
    return styles.find((s) => s.id === type) ?? styles.find((s) => s.name === type) ?? (type ? undefined : styles[0]);
  }

  /** Body and title paragraph styles of a box style. */
  calloutStyles(style: ResolvedCalloutStyleConfig | undefined): { body: string; title: string } {
    if (!style) return { body: STYLE.normal, title: STYLE.boxTitle };
    const u = this.units;
    const b = style.body;
    const t = style.titleStyle;
    const body = this.idFor(`box:${style.id}`, 'PostextBox', style.id);
    if (body.fresh) {
      const size = px(u, b.fontSize, this.bodyPx);
      const after = b.paragraphSpacing === false ? 0 : b.paragraphSpacing === true ? twips(u, b.lineHeight, size) : twips(u, b.paragraphSpacing, size);
      this.add(this.ink(this.face(body.id, b.fontFamily, b.fontWeight, b.italic), b.color, b.boldColor ?? this.resolved.bodyText.boldColor, b.italicColor ?? this.resolved.bodyText.italicColor), {
        type: 'paragraph',
        name: `Box: ${style.name || style.id}`,
        custom: true,
        basedOn: STYLE.normal,
        pPr: {
          suppressAutoHyphens: !b.hyphenation || undefined,
          after,
          line: { twips: twips(u, b.lineHeight, size), rule: 'atLeast' },
          ind: boxBodyIndent(u, b, size),
          jc: b.textAlign === 'justify' ? 'both' : 'left',
        },
        rPr: {
          ...this.font(b.fontFamily, b.fontWeight, b.italic),
          i: b.italic,
          smallCaps: b.smallCaps || undefined,
          color: hex(b.color),
          spacing: b.letterSpacing ? twips(u, b.letterSpacing, size) : undefined,
          sz: halfPoints(u, b.fontSize, this.bodyPx),
        },
      });
    }
    const title = this.idFor(`boxTitle:${style.id}`, 'PostextBoxTitle', style.id);
    if (title.fresh) {
      const size = px(u, t.fontSize, this.bodyPx);
      this.add(title.id, {
        type: 'paragraph',
        name: `Box title: ${style.name || style.id}`,
        custom: true,
        basedOn: STYLE.boxTitle,
        pPr: { suppressAutoHyphens: true, after: twips(u, t.gap, size), line: { twips: twips(u, t.lineHeight, size), rule: 'atLeast' }, ind: { left: twips(u, t.indent, size), firstLine: 0 } },
        rPr: {
          ...this.font(t.fontFamily, t.fontWeight, t.italic),
          b: t.fontWeight >= 600,
          i: t.italic,
          caps: t.textTransform === 'uppercase' || undefined,
          color: hex(t.color),
          spacing: t.letterSpacing.value ? twips(u, t.letterSpacing, size) : undefined,
          sz: halfPoints(u, t.fontSize, this.bodyPx),
        },
      });
    }
    return { body: body.id, title: title.id };
  }

  docDefaults(lang: string | undefined): string {
    const l = lang ? `<w:lang w:val="${escapeAttr(lang)}" w:eastAsia="${escapeAttr(lang)}" w:bidi="${escapeAttr(lang)}"/>` : '';
    // Vertical text keeps no widow or orphan control: Word applies none
    // unless asked, while LibreOffice applies it by default and, in a
    // tbRl section, drops the lines it moves to the next page (#1444).
    const p = this.resolved.layout.writingMode === 'vertical-rl' ? '<w:pPr><w:widowControl w:val="0"/></w:pPr>' : '<w:pPr/>';
    return `<w:docDefaults><w:rPrDefault><w:rPr>${l}</w:rPr></w:rPrDefault><w:pPrDefault>${p}</w:pPrDefault></w:docDefaults>`;
  }

  /** The `w:style` elements (after `w:docDefaults`). */
  xml(): string {
    let out = '';
    // Each style's leading as every reader sets it (prose/leading.ts).
    const upright = this.resolved.layout.writingMode !== 'vertical-rl';
    const leadings = this.plain || !upright ? undefined : styleLeadings(this.defs, this.plan);
    for (const [id, def] of this.defs) {
      const line = leadings?.get(id);
      const d = line ? { ...def, pPr: { ...def.pPr, line } } : def;
      const attrs = `w:type="${d.type}"${d.isDefault ? ' w:default="1"' : ''} w:styleId="${escapeAttr(id)}"${d.custom ? ' w:customStyle="1"' : ''}`;
      let inner = `<w:name w:val="${escapeAttr(d.name)}"/>`;
      if (d.basedOn) inner += `<w:basedOn w:val="${d.basedOn}"/>`;
      if (d.next) inner += `<w:next w:val="${d.next}"/>`;
      if (d.semiHidden) inner += '<w:semiHidden/>';
      inner += '<w:qFormat/>';
      if (d.type === 'paragraph' && d.pPr) inner += pPr(d.pPr);
      if (d.rPr) inner += rPr(d.rPr);
      out += `<w:style ${attrs}>${inner}</w:style>`;
    }
    return out;
  }
}
